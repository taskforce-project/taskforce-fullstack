package com.taskforce.tf_api.core.service.agent;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
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

    /** La clé de l'origine d'une réponse qui a sous les yeux une issue importée d'un outil de l'entreprise (R158). */
    public static final String IMPORTED = "imported";

    /** L'outil de l'espace qui rend le texte des issues. */
    private static final String LISTS_ISSUES = "list_issues";

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

        /**
         * Ce que la réponse a reçu avant le premier outil : des notes, l'écran, une issue jointe sont des données de
         * l'espace ; une issue importée d'un outil de l'entreprise sous ses yeux ({@link CortexGate#IMPORTED}) est un
         * contenu du dehors (séance n°22, R158).
         */
        public static Exposure of(Map<String, Object> origin) {
            Exposure exposure = new Exposure();
            if (origin != null) {
                Object served = origin.get("notes");
                boolean notes = served instanceof java.util.Collection<?> c && !c.isEmpty();
                exposure.sensitive = notes || origin.containsKey("screen") || origin.containsKey("issue")
                    || origin.containsKey("attached");
                if (Boolean.TRUE.equals(origin.get(IMPORTED))) {
                    exposure.outside();
                }
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

        /**
         * Un contenu importé d'un outil de l'entreprise est entré dans la réponse (séance n°22, R158) : écrit par
         * n'importe qui dans cet outil, il vient du dehors, et ce sont des données de l'entreprise.
         */
        public void outside() {
            untrusted = true;
            sensitive = true;
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

    /**
     * Si ce que la réponse a sous les yeux tient une issue importée d'un outil de l'entreprise (séance n°22, R158) :
     * l'issue de l'écran, une issue jointe ou lue pour elle ; le tableau d'un projet, à l'écran ou joint, qui en tient une.
     */
    @Transactional(readOnly = true)
    public boolean importedInView(AgentContext ctx, List<Screen> attached, Collection<Long> issuesRead) {
        List<Screen> seen = new ArrayList<>();
        if (!ctx.screen().isEmpty()) {
            seen.add(ctx.screen());
        }
        if (attached != null) {
            seen.addAll(attached);
        }
        List<Long> ids = new ArrayList<>(issuesRead == null ? List.of() : issuesRead);
        seen.stream().map(Screen::issueId).forEach(ids::add);
        List<Long> wanted = ids.stream().filter(Objects::nonNull).distinct().toList();
        if (!wanted.isEmpty() && issues.existsByIdInAndProjectWorkspaceIdAndImportedFromIsNotNull(wanted, ctx.workspaceId())) {
            return true;
        }
        return seen.stream().filter(s -> s.issueId() == null).map(Screen::projectId).filter(Objects::nonNull).distinct()
            .anyMatch(issues::existsByProjectIdAndImportedFromIsNotNull);
    }

    /**
     * Si l'outil de l'espace qui vient de lire a pu rendre une issue importée d'un outil de l'entreprise (R158) : la liste
     * des issues d'un projet nommé par sa clé, ce projet ; sans projet, ou d'un projet nommé autrement, l'espace (dans le
     * doute, un contenu du dehors).
     */
    @Transactional(readOnly = true)
    public boolean readImported(AgentContext ctx, Map<String, String> facts, String argsJson) {
        if (facts == null || !LISTS_ISSUES.equals(facts.get("tool"))) {
            return false;
        }
        JsonNode args = args(argsJson);
        JsonNode named = args == null ? null : args.get("project");
        if (named != null && named.isTextual() && !named.asText().isBlank()) {
            Optional<Long> project = projects.findByWorkspaceIdAndIdentifier(ctx.workspaceId(),
                named.asText().strip().toUpperCase(Locale.ROOT)).map(p -> p.getId());
            if (project.isPresent()) {
                return issues.existsByProjectIdAndImportedFromIsNotNull(project.get());
            }
        }
        return issues.existsByProjectWorkspaceIdAndImportedFromIsNotNull(ctx.workspaceId());
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
        return judge(bundle, tool, argsJson, exposure, null);
    }

    /**
     * Comme {@link #judge(RulesBundle, AgentTool, String, Exposure)}, avec ce que l'outil dit lui-même de cet appel dans
     * ce contexte ({@link AgentTool#facts}) : le connecteur où {@code save_document} rangerait, par exemple.
     */
    public Verdict judge(RulesBundle bundle, AgentTool tool, String argsJson, Exposure exposure, AgentContext ctx) {
        Map<String, String> facts = facts(tool);
        if (ctx != null) {
            facts.putAll(toolFacts(tool, argsJson, ctx));
        }
        facts.putAll(floorFacts(tool, argsJson, exposure));
        return judge(bundle, facts);
    }

    /** Ce qu'un appel a pour lui-même dans les mots du contrat : seulement les faits que le moteur connaît. */
    private Map<String, String> toolFacts(AgentTool tool, String argsJson, AgentContext ctx) {
        JsonNode args = args(argsJson);
        Map<String, Object> parsed = args == null ? Map.of()
            : objectMapper.convertValue(args, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
        Map<String, String> out = new LinkedHashMap<>();
        tool.facts(parsed, ctx).forEach((k, v) -> {
            if (TOOL_FACTS.contains(k) && v != null) out.put(k, v);
        });
        return out;
    }

    /** Ce qu'un outil peut dire de lui-même : jamais l'acteur, ni les faits que le socle produit. */
    private static final Set<String> TOOL_FACTS = Set.of("server");

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

    /** Ce que les règles du travail ont décidé d'un appel : la décision, le paquet et le projet qui l'ont prise. */
    public record Judged(Verdict verdict, RulesBundle bundle, Long project) {
    }

    /** Le projet du travail en cours : celui de la conversation, sinon celui de l'écran ; jamais un argument d'outil. */
    public static Long workProject(AgentContext ctx) {
        return ctx.project() != null ? ctx.project() : ctx.screen().projectId();
    }

    /**
     * Juge un appel avec les règles du travail en cours, celles de {@code project} : jamais celles d'un projet que nomment
     * les arguments d'un outil. Un outil de TaskForce qui nomme un autre projet agit sur lui : il est jugé aussi avec les
     * règles de ce projet, et la décision la plus stricte l'emporte. Les arguments d'un outil de l'entreprise parlent de
     * cet outil, pas de TaskForce. {@code bundles} rend le paquet d'un projet.
     */
    public Judged judgeWork(AgentContext ctx, Long project, AgentTool tool, String argsJson, Exposure exposure,
                            Function<Long, RulesBundle> bundles) {
        RulesBundle bundle = bundles.apply(project);
        Verdict verdict = judge(bundle, tool, argsJson, exposure, ctx);
        Optional<Long> named = tool instanceof ExternalMcpTool ? Optional.empty()
            : projectOf(ctx, argsJson).filter(p -> !p.equals(project));
        if (named.isEmpty()) {
            return new Judged(verdict, bundle, project);
        }
        RulesBundle there = bundles.apply(named.get());
        Verdict other = judge(there, tool, argsJson, exposure, ctx);
        Verdict kept = stricter(verdict, other);
        return kept == other ? new Judged(other, there, named.get()) : new Judged(kept, bundle, project);
    }

    /**
     * La plus stricte de deux décisions : refuser, puis demander, puis autoriser. Deux demandes réunissent leurs
     * obligations ; la règle dite est celle qui en porte, sinon la première.
     */
    public static Verdict stricter(Verdict first, Verdict second) {
        int a = rank(first.effect());
        int b = rank(second.effect());
        if (b > a) {
            return second;
        }
        if (a > b || !RulesEngine.ASK.equals(first.effect())) {
            return first;
        }
        RulesEngine.Obligations merged = merge(first.require(), second.require());
        Verdict said = first.require() == null && second.require() != null ? second : first;
        if (Objects.equals(merged, said.require())) {
            return said;
        }
        return new Verdict(said.effect(), said.ruleId(), said.reason(), said.facts(), merged);
    }

    private static int rank(String effect) {
        return switch (effect) {
            case RulesEngine.DENY -> 3;
            case RulesEngine.ASK -> 2;
            default -> 1;
        };
    }

    private static RulesEngine.Obligations merge(RulesEngine.Obligations a, RulesEngine.Obligations b) {
        if (a == null) {
            return b;
        }
        if (b == null) {
            return a;
        }
        List<List<String>> approvers = new ArrayList<>(a.approvers());
        for (List<String> set : b.approvers()) {
            if (!approvers.contains(set)) {
                approvers.add(set);
            }
        }
        return new RulesEngine.Obligations(List.copyOf(approvers), Math.max(a.signatures(), b.signatures()),
            a.separate() || b.separate());
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
     * lu ; pour un outil de l'entreprise, ses arguments simples ({@code arg.<nom>}) et les nombres de ses objets
     * imbriqués, qu'un seuil peut lire.
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
            arguments(args, facts, 0);
        }
        return facts;
    }

    /** La profondeur des objets imbriqués dont un nombre se lit encore ({@code {"payment": {"amount": 5000}}}). */
    private static final int MAX_DEPTH = 4;

    /**
     * Les arguments simples d'un outil de l'entreprise, sous leur nom ({@code arg.<nom>}) : ceux du premier niveau, et les
     * nombres des objets imbriqués. Deux valeurs sous le même nom : la plus forte pour un seuil (une valeur qui n'est pas
     * un nombre, sinon le plus grand nombre).
     */
    private static void arguments(JsonNode node, Map<String, String> facts, int depth) {
        node.fields().forEachRemaining(f -> {
            JsonNode value = f.getValue();
            if (!f.getKey().matches("[A-Za-z0-9_]{1,40}")) {
                return;
            }
            if (value.isObject()) {
                if (depth < MAX_DEPTH) {
                    arguments(value, facts, depth + 1);
                }
                return;
            }
            String read = depth == 0 ? argument(value) : value.isNumber() ? argument(value) : null;
            if (read != null) {
                facts.merge("arg." + f.getKey(), read, CortexGate::strongerForAThreshold);
            }
        });
    }

    /** De deux valeurs d'un même argument, celle qui compte le plus pour un seuil. */
    private static String strongerForAThreshold(String a, String b) {
        BigDecimal x = number(a);
        BigDecimal y = number(b);
        if (x == null) {
            return a;
        }
        if (y == null) {
            return b;
        }
        return x.compareTo(y) >= 0 ? a : b;
    }

    private static BigDecimal number(String value) {
        try {
            return new BigDecimal(value);
        } catch (NumberFormatException e) {
            return null;
        }
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
