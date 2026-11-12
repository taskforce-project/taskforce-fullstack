package com.taskforce.tf_api.core.service.rules;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.service.AiMeter;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.shared.exception.BusinessException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Les mots de la personne, traduits par le modèle de l'espace (R94) : une règle écrite en phrase devient des règles du
 * contrat et des cas ; une action décrite devient ses faits. Le modèle ne décide de rien : ce qu'il rend se valide
 * ensuite sans lui ({@link RuleValidator}, {@link RuleCases}), et le moteur juge. Ce qu'il rend de mal formé tombe ici.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RuleDraftService {

    /** Le palier du modèle principal de l'espace, celui de Cortex. */
    static final String TIER = "standard";
    static final int MAX_RULES = 4;
    static final int MAX_CASES = 6;
    static final int MAX_MEMBERS = 60;
    static final int MAX_VALUE = 200;

    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    private final LlmClient llm;
    private final AiMeter aiMeter;
    private final ObjectMapper objectMapper;

    /** Une personne que la règle peut désigner, telle que le modèle la lit. */
    public record Member(Long id, String name, String jobTitle, String role) {
    }

    /** Ce que le modèle a compris d'une règle. */
    public record Translation(List<Map<String, Object>> rules, List<RuleCases.Case> cases, String approverNeeded,
                              String unclear) {
    }

    /** Ce que le modèle a compris d'une action décrite : ses faits, ou ce qui manque pour la juger. */
    public record Reading(Map<String, String> facts, String unclear) {
    }

    public boolean available() {
        return llm.isConfigured();
    }

    /**
     * Traduit une règle en mots ; une erreur métier dit à la personne que faire quand le modèle ne répond pas. Hors de la
     * transaction de l'appelant : l'attente du modèle ne s'y fait pas, et son usage s'enregistre à part.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public Translation translate(Long workspaceId, String text, String layer, List<Member> members, List<String> tools) {
        JsonNode json = ask(workspaceId, rulesPrompt(layer, members, tools), "Rule: " + text);
        List<Map<String, Object>> rules = new ArrayList<>();
        for (JsonNode rule : json.path("rules")) {
            if (rules.size() >= MAX_RULES) {
                break;
            }
            Map<String, Object> clean = new LinkedHashMap<>();
            Map<String, Object> raw = objectMapper.convertValue(rule, MAP);
            if (raw.get("when") instanceof Map<?, ?> when) {
                clean.put("when", when);
            }
            clean.put("effect", raw.get("effect"));
            if (raw.get("require") instanceof Map<?, ?> require && !require.isEmpty()) {
                clean.put("require", require);
            }
            rules.add(clean);
        }
        return new Translation(rules, cases(json.path("cases")), text(json, "approverNeeded"), text(json, "unclear"));
    }

    /** Lit une action décrite (« Claude Code changes src/accounting/ledger.ts ») en faits ; seuls des faits connus restent. */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public Reading read(Long workspaceId, String text, List<String> tools) {
        JsonNode json = ask(workspaceId, actionPrompt(tools), "Action: " + text);
        Map<String, String> facts = facts(json.path("facts"));
        return new Reading(facts, facts == null ? Objects.requireNonNullElse(text(json, "unclear"), "") : text(json, "unclear"));
    }

    private JsonNode ask(Long workspaceId, String system, String user) {
        if (!llm.isConfigured()) {
            throw new BusinessException("Rules are written in words through your workspace's model, and it isn't "
                + "reachable right now. Check Settings > AI, then try again.");
        }
        String content;
        try {
            content = aiMeter.metered(workspaceId, () -> llm.chatCompletion(system, user, true, TIER));
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Règles : le modèle n'a pas répondu : {}", e.getMessage());
            throw new BusinessException("Your workspace's model didn't answer. Try again in a moment.");
        }
        try {
            JsonNode json = objectMapper.readTree(content == null ? "" : content.strip());
            if (json == null || !json.isObject()) {
                throw new BusinessException("TaskForce couldn't read what the model wrote. Try writing it another way.");
            }
            return json;
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new BusinessException("TaskForce couldn't read what the model wrote. Try writing it another way.");
        }
    }

    private List<RuleCases.Case> cases(JsonNode list) {
        List<RuleCases.Case> out = new ArrayList<>();
        for (JsonNode c : list) {
            if (out.size() >= MAX_CASES) {
                break;
            }
            Map<String, String> facts = facts(c.path("facts"));
            String expect = c.path("expect").asText("");
            if (facts == null || !Set.of("allow", "ask", "deny").contains(expect)) {
                continue;
            }
            List<String> approvers = null;
            if (c.path("approvers").isArray() && !c.path("approvers").isEmpty()) {
                approvers = new ArrayList<>();
                for (JsonNode a : c.path("approvers")) {
                    approvers.add(a.asText());
                }
            }
            String said = text(c, "text");
            out.add(new RuleCases.Case(said == null ? null : clip(said), facts, new RuleCases.Expect(expect, approvers),
                RuleCases.BY_MODEL));
        }
        return out;
    }

    /**
     * Les faits d'une action, tels que TaskForce les produit : une action du contrat, et seulement les faits que TaskForce
     * produit pour elle (et l'acteur) ; un agent quand l'acteur manque. Null quand l'action n'est pas connue.
     */
    static Map<String, String> facts(JsonNode node) {
        if (node == null || !node.isObject()) {
            return null;
        }
        String action = node.path("action").asText("");
        Set<String> produced = RuleValidator.FACTS.get(action);
        if (produced == null) {
            return null;
        }
        Map<String, String> facts = new LinkedHashMap<>();
        facts.put("action", action);
        node.fields().forEachRemaining(f -> {
            String key = f.getKey();
            boolean known = produced.contains(key) || "actor".equals(key)
                || (produced.contains("over") && RuleValidator.FACT.matcher(key).matches());
            if (known && f.getValue().isValueNode() && !f.getValue().isNull()) {
                String value = f.getValue().asText();
                if (!value.isBlank() && value.length() <= MAX_VALUE) {
                    facts.put(key, value);
                }
            }
        });
        String actor = facts.get("actor");
        if (!"agent".equals(actor) && !"person".equals(actor)) {
            facts.put("actor", "agent");
        }
        return facts;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (!value.isTextual() || value.asText().isBlank() || "null".equals(value.asText())) {
            return null;
        }
        return clip(value.asText());
    }

    private static String clip(String text) {
        String t = text.strip();
        return t.length() > 300 ? t.substring(0, 300) : t;
    }

    // ------------------------------------------------------------------------------------------------- consignes

    static final String ACTIONS = """
        Actions ("action"), with the conditions each one has:
        - file.read, file.search: reading files of the repository ("path")
        - file.write: changing or creating a file of the repository ("path")
        - shell: a command the agent runs ("command": the command line, for example "rm -rf build")
        - git.commit: a local commit ("command"); git.push: pushing a branch ("branch", "repoVisibility": "public" or "private"); pr.open: opening a pull request ("branch", "repoVisibility")
        - mission.start: starting a coding mission ("repoVisibility")
        - issue.read, issue.create, issue.update, issue.delete, comment.create, project.create: TaskForce's issues, comments and projects
        - knowledge.search, knowledge.create: the workspace's notes
        - web.search, web.fetch: the web
        - mcp.read, mcp.write: reading or changing data in a company tool connected to TaskForce ("server": the tool's key; "tool": the tool's own action name; an amount above a threshold is "over": {"fact": "arg.<argument name>", "value": <whole number>})
        "path", "command", "branch", "server" and "tool" are patterns: * is any text without /, ** is any text, {a,b} is a or b. A module or folder named X anywhere in the repository is "**/X/**".
        "actor": "agent" or "person", only when the rule speaks of agents or of people acting themselves.
        """;

    static String rulesPrompt(String layer, List<Member> members, List<String> tools) {
        StringBuilder who = new StringBuilder();
        members.stream().limit(MAX_MEMBERS).forEach(m -> who.append("- ").append(m.id()).append(": ").append(m.name())
            .append(m.jobTitle() == null || m.jobTitle().isBlank() ? "" : ", " + m.jobTitle())
            .append(" (").append(m.role().toLowerCase(java.util.Locale.ROOT)).append(")\n"));
        return """
            You turn a rule that a company writes in words into TaskForce rules. TaskForce judges every action of its agents \
            (Claude Code working in a copy of a repository, Cortex the assistant) and of people with these rules. A company's \
            rules can only make TaskForce stricter: each of your rules asks a person first ("ask") or refuses ("deny"). Never \
            allow anything.
            These rules apply to %s.

            Answer with one JSON object and nothing else:
            {"rules": [{"when": {...}, "effect": "ask" or "deny", "require": {...}}],
             "cases": [{"text": "...", "facts": {...}, "expect": "ask" or "deny" or "allow"}],
             "approverNeeded": null, or the words of the rule that name who approves when no member below matches,
             "unclear": null, or what the rule asks that these conditions can't say}

            "when" holds conditions that must all hold.
            %s
            "require", only with "ask":
            - "approvers": who may approve, any one of them: "person:<id>" for a member below, "role:admin" (an admin or owner of the workspace), "role:owner", "project-lead" (the lead of the project at hand)
            - "signatures": 2 when two different people must approve
            - "separate": true when the person who prepared or asked for the action can't approve it

            Members (id: name, job title (workspace role)):
            %s
            Connected company tools (keys): %s

            "cases": two to four actions, each in one short sentence, with its facts (the action and its conditions) and what \
            the rules should decide: at least one action the rule covers, and one close to it that it doesn't cover.

            Example. Rule: "No change in the accounting module without the approval of the finance lead", with member 42: Marie Martin, Finance lead:
            {"rules":[{"when":{"action":"file.write","path":"**/accounting/**"},"effect":"ask","require":{"approvers":["person:42"]}},{"when":{"action":"shell","command":"**accounting/**"},"effect":"ask","require":{"approvers":["person:42"]}}],"cases":[{"text":"Claude Code changes src/accounting/ledger.ts","facts":{"action":"file.write","path":"src/accounting/ledger.ts"},"expect":"ask","approvers":["person:42"]},{"text":"Claude Code changes src/billing/invoice.ts","facts":{"action":"file.write","path":"src/billing/invoice.ts"},"expect":"allow"}],"approverNeeded":null,"unclear":null}

            Example. Rule: "Any refund above 1,000 in Stripe needs two signatures, and not from whoever prepared it":
            {"rules":[{"when":{"action":"mcp.write","server":"stripe","over":{"fact":"arg.amount","value":1000}},"effect":"ask","require":{"signatures":2,"separate":true}}],"cases":[{"text":"Cortex refunds 1,500 in Stripe","facts":{"action":"mcp.write","server":"stripe","arg.amount":"1500"},"expect":"ask"}],"approverNeeded":null,"unclear":null}
            """.formatted(layer, ACTIONS, who.length() == 0 ? "(none)\n" : who.toString(),
                tools.isEmpty() ? "(none)" : String.join(", ", tools));
    }

    static String actionPrompt(List<String> tools) {
        return """
            A person describes an action that an agent (Claude Code, Cortex) or a person could do in TaskForce. Describe it \
            with the facts TaskForce would see, so that TaskForce can tell what its rules would decide.

            Answer with one JSON object and nothing else:
            {"facts": {"action": "...", ...the conditions that apply..., "actor": "agent" or "person"}, "unclear": null}
            When the action is none of those below, answer {"facts": null, "unclear": "<what TaskForce can't judge>"}.

            %s
            Write the facts as plain values, not patterns: a file is its path ("src/accounting/ledger.ts"), a command its \
            command line. An amount in a company tool is "arg.amount": "1500".
            Connected company tools (keys): %s

            Example. Action: "Claude Code changes the ledger in the accounting module"
            {"facts":{"action":"file.write","path":"src/accounting/ledger.ts","actor":"agent"},"unclear":null}
            """.formatted(ACTIONS, tools.isEmpty() ? "(none)" : String.join(", ", tools));
    }
}
