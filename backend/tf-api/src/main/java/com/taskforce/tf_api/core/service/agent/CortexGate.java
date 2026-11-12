package com.taskforce.tf_api.core.service.agent;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;
import com.taskforce.tf_api.core.harness.rules.SecretScan;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.mcp.ExternalMcpTool;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Le noyau pour Cortex (séance n°7 du Conseil, R35) : chaque outil que Cortex veut lancer est jugé
 * par les règles de l'espace, avec le même moteur et le même contrat que les actions d'un agent délégué
 * (contracts/rules). La décision ne dépend ni du modèle ni du code de Cortex : allow, l'outil tourne ; ask, il est
 * proposé à la personne ; deny, il ne tourne pas, et la règle dit pourquoi.
 *
 * <p>Les règles sont celles du travail en cours (R157) : la table, et les couches de l'organisation, du projet que l'outil
 * touche et de la personne qui demande. Les faits que le socle lit viennent d'ici : Cortex est un agent ; un secret
 * dans les arguments ; ce que la réponse a déjà lu ({@link Exposure}).</p>
 */
@Component
@RequiredArgsConstructor
public class CortexGate {

    /**
     * L'action que fait chaque outil interne, dans les mots du contrat, comme le runner nomme les outils de TaskForce.
     * Un outil absent d'ici n'a pas d'action : aucune règle ne le couvre, il est donc demandé.
     */
    static final Map<String, String> ACTIONS = Map.of(
        "search_brain", "knowledge.search",
        "list_projects", "issue.read",
        "list_issues", "issue.read",
        "find_integration", "mcp.read",
        "create_issue", "issue.create",
        "create_project", "project.create",
        "create_note", "knowledge.create");

    /** Les actions qui lisent sans rien changer : au rejeu d'un cas, la cassette les sert. */
    static final Set<String> READS = Set.of("knowledge.search", "issue.read", "mcp.read");

    /** Les lectures de l'espace : ce qu'elles rendent, ce sont des données de l'entreprise (le fait {@code sensitive}). */
    private static final Set<String> WORKSPACE_READS = Set.of("knowledge.search", "issue.read");

    /** Une clé d'issue (« ACC-12 ») : l'identifiant de son projet, puis son numéro. */
    private static final Pattern ISSUE_KEY = Pattern.compile("^([A-Za-z][A-Za-z0-9]{0,9})-(\\d{1,9})$");
    private static final int MAX_ARG = 120;

    private static final String NO_RULE = "No rule of this workspace covers this action, so it waits for the person.";

    private final HarnessRulesService rules;
    private final WorkspaceRepository workspaces;
    private final ProjectRepository projects;
    private final IssueRepository issues;
    private final ObjectMapper objectMapper;

    /**
     * Ce que le noyau a décidé pour un outil : l'effet, la règle qui l'emporte (nulle si aucune), les faits jugés, et ce
     * qu'un accord doit réunir quand une règle de l'entreprise le dit (R98).
     */
    public record Verdict(String effect, String ruleId, String reason, Map<String, String> facts,
                          RulesEngine.Obligations require) {

        public Verdict(String effect, String ruleId, String reason, Map<String, String> facts) {
            this(effect, ruleId, reason, facts, null);
        }

        public boolean allowed() {
            return RulesEngine.ALLOW.equals(effect);
        }

        public boolean denied() {
            return RulesEngine.DENY.equals(effect);
        }
    }

    /**
     * Ce qu'une réponse de Cortex a déjà lu (R158) : un contenu venu d'un outil de l'entreprise, écrit par n'importe qui
     * ({@code untrusted}), et des données de l'espace ou de ses outils ({@code sensitive}). Les deux ensemble, une
     * écriture ou une sortie attend une personne : le socle le décide, avec ces faits.
     */
    public static final class Exposure {
        private boolean untrusted;
        private boolean sensitive;

        /** Rien de lu encore : un geste repris sur la réponse de la personne, une action accordée. */
        public static Exposure none() {
            return new Exposure();
        }

        /** Ce que la réponse a reçu avant le premier outil : des notes, l'écran, une issue jointe sont des données de l'espace. */
        public static Exposure of(Map<String, Object> origin) {
            Exposure exposure = new Exposure();
            if (origin != null) {
                Object served = origin.get("notes");
                boolean notes = served instanceof java.util.Collection<?> c && !c.isEmpty();
                exposure.sensitive = notes || origin.containsKey("screen") || origin.containsKey("issue")
                    || origin.containsKey("attached");
            }
            return exposure;
        }

        /** Un outil a rendu son résultat : ce qu'il a lu entre dans la réponse. */
        public void after(AgentTool tool, Map<String, String> facts, String status) {
            if (!"success".equals(status)) {
                return;
            }
            if (tool instanceof ExternalMcpTool) {
                untrusted = true;
                sensitive = true;
            } else if (facts != null && WORKSPACE_READS.contains(facts.get("action"))) {
                sensitive = true;
            }
        }

        public boolean untrusted() {
            return untrusted;
        }

        public boolean sensitive() {
            return sensitive;
        }
    }

    /** Les règles de l'espace pour ce que la conversation a à l'écran ou pour son projet, lues une fois par réponse. */
    @Transactional(readOnly = true)
    public RulesBundle rulesFor(AgentContext ctx) {
        return rulesFor(ctx, null);
    }

    /** Les règles du travail en cours : la table, l'organisation, le projet que l'outil touche, la personne qui demande. */
    @Transactional(readOnly = true)
    public RulesBundle rulesFor(AgentContext ctx, Long projectId) {
        Workspace workspace = workspaces.findById(ctx.workspaceId())
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found"));
        Long project = projectId != null ? projectId : ctx.project() != null ? ctx.project() : ctx.screen().projectId();
        return rules.bundleFor(workspace, new HarnessRulesService.Work(project, null, ctx.userId()));
    }

    /**
     * Le projet que touche un appel d'outil, d'après ses arguments : son id, celui de son issue, ou la clé de son issue
     * (« ACC-12 ») ; vide quand les arguments ne le disent pas (le projet de la conversation, ou de l'écran, vaut alors).
     */
    @Transactional(readOnly = true)
    public Optional<Long> projectOf(AgentContext ctx, String argsJson) {
        JsonNode args = args(argsJson);
        if (args == null) {
            return Optional.empty();
        }
        JsonNode id = args.get("projectId");
        if (id != null && id.canConvertToLong()) {
            return projects.findByIdAndWorkspaceId(id.asLong(), ctx.workspaceId()).map(p -> p.getId());
        }
        JsonNode issueId = args.get("issueId");
        if (issueId != null && issueId.canConvertToLong()) {
            return issues.findById(issueId.asLong())
                .filter(i -> ctx.workspaceId().equals(i.getProject().getWorkspace().getId()))
                .map(i -> i.getProject().getId());
        }
        for (String field : new String[] { "issue", "issueKey", "key" }) {
            JsonNode key = args.get(field);
            Matcher m = key != null && key.isTextual() ? ISSUE_KEY.matcher(key.asText().strip()) : null;
            if (m != null && m.matches()) {
                return projects.findByWorkspaceIdAndIdentifier(ctx.workspaceId(), m.group(1).toUpperCase(java.util.Locale.ROOT))
                    .map(p -> p.getId());
            }
        }
        return Optional.empty();
    }

    /** Juge un outil : ses faits, puis la règle la plus stricte qui les couvre. */
    public Verdict judge(RulesBundle bundle, AgentTool tool) {
        return judge(bundle, tool, null, Exposure.none());
    }

    /**
     * Juge un appel d'outil : ses faits, ceux que le socle lit (Cortex est un agent ; un secret dans ses arguments ; ce
     * que la réponse a déjà lu), puis la règle la plus stricte qui les couvre, couches de l'entreprise et socle compris.
     */
    public Verdict judge(RulesBundle bundle, AgentTool tool, String argsJson, Exposure exposure) {
        Map<String, String> facts = facts(tool);
        facts.putAll(floorFacts(tool, argsJson, exposure));
        return judge(bundle, facts);
    }

    /**
     * Juge un geste par ses faits, quand il n'est pas un outil de Cortex : un outil lancé par la personne depuis la
     * console, l'import d'un projet qui crée un projet et ses issues (séance n°22, R158 : la console et l'import passent
     * par le moteur comme tout autre geste). Ceux qui l'appellent disent l'acteur ({@link #personFacts}).
     */
    public Verdict judge(RulesBundle bundle, Map<String, String> facts) {
        RulesEngine.Decision decision = RulesEngine.decide(bundle, facts);
        RulesBundle.Rule rule = decision.rule();
        return new Verdict(decision.effect(), rule == null ? null : rule.id(), rule == null ? NO_RULE : reasonOf(rule),
            facts, decision.require());
    }

    /** La raison d'une règle telle que la personne la lit : sa phrase quand une personne l'a écrite. */
    private static String reasonOf(RulesBundle.Rule rule) {
        return rule.text() != null && !rule.text().isBlank() ? rule.text() : rule.reason();
    }

    /**
     * Les faits d'un outil : son action, son nom et, pour un outil externe, le serveur qui le porte. Un geste du MCP
     * TaskForce porte son action lui-même (ADR-024) : la même que la table juge quand un agent extérieur le fait.
     *
     * <p>La classe d'un outil externe est celle que TaskForce lui donne (séance n°22, R158) : celle du préréglage de son
     * serveur, une écriture pour un outil inconnu, quoi que le serveur déclare de lui-même ({@code readOnlyHint}).</p>
     */
    public static Map<String, String> facts(AgentTool tool) {
        String name = tool.name() == null ? "" : tool.name();
        Map<String, String> facts = new LinkedHashMap<>();
        if (tool instanceof ExternalMcpTool external) {
            facts.put("action", external.isReadOnly() ? "mcp.read" : "mcp.write");
            facts.put("server", external.connectorKey());
        } else if (tool.action() != null) {
            facts.put("action", tool.action());
        } else if (ACTIONS.containsKey(name)) {
            facts.put("action", ACTIONS.get(name));
        }
        facts.put("tool", name);
        return facts;
    }

    /**
     * Les faits d'un geste que la personne fait elle-même, depuis la console d'actions ou l'import d'un projet (séance
     * n°22, R158) : ceux de l'outil, ce que le socle lit encore pour elle (un secret dans les arguments, les arguments
     * simples qu'un seuil peut lire), et l'acteur, une personne (R157).
     */
    public Map<String, String> personFacts(AgentTool tool, String argsJson) {
        Map<String, String> facts = facts(tool);
        facts.putAll(floorFacts(tool, argsJson, Exposure.none()));
        facts.put("actor", "person");
        return facts;
    }

    /**
     * Les faits du socle et des seuils (R157, R158) : l'acteur, le secret dans les arguments, ce que la réponse a déjà
     * lu ; pour un outil de l'entreprise, ses arguments simples ({@code arg.<nom>}), qu'un seuil peut lire.
     */
    Map<String, String> floorFacts(AgentTool tool, String argsJson, Exposure exposure) {
        Map<String, String> facts = new LinkedHashMap<>();
        facts.put("actor", "agent");
        if (argsJson != null && SecretScan.in(argsJson)) {
            facts.put("secret", "true");
        }
        if (exposure != null && exposure.untrusted()) {
            facts.put("untrusted", "true");
        }
        if (exposure != null && exposure.sensitive()) {
            facts.put("sensitive", "true");
        }
        JsonNode args = tool instanceof ExternalMcpTool ? args(argsJson) : null;
        if (args != null) {
            args.fields().forEachRemaining(f -> {
                String value = argument(f.getValue());
                if (value != null && f.getKey().matches("[A-Za-z0-9_]{1,40}")) {
                    facts.put("arg." + f.getKey(), value);
                }
            });
        }
        return facts;
    }

    /** Un argument simple, en texte : un nombre en chiffres (sans exposant), un mot ; rien pour un objet ou une liste. */
    private static String argument(JsonNode value) {
        if (value.isNumber()) {
            return new BigDecimal(value.asText()).stripTrailingZeros().toPlainString();
        }
        if (value.isTextual() && value.asText().length() <= MAX_ARG) {
            return value.asText();
        }
        if (value.isBoolean()) {
            return value.asText();
        }
        return null;
    }

    private JsonNode args(String argsJson) {
        if (argsJson == null || argsJson.isBlank()) {
            return null;
        }
        try {
            JsonNode node = objectMapper.readTree(argsJson);
            return node != null && node.isObject() ? node : null;
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            return null;
        }
    }
}
