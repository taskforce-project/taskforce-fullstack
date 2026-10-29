package com.taskforce.tf_api.core.service.agent;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.mcp.ExternalMcpTool;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Le noyau pour Cortex (séance n°7 du Conseil, R35) : chaque outil que Cortex veut lancer est jugé
 * par les règles de l'espace, avec le même moteur et le même contrat que les actions d'un agent délégué
 * (contracts/rules). La décision ne dépend ni du modèle ni du code de Cortex : allow, l'outil tourne ; ask, il est
 * proposé à la personne ; deny, il ne tourne pas, et la règle dit pourquoi.
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
        "create_note", "knowledge.write");

    /** Les actions qui lisent sans rien changer : au rejeu d'un cas, la cassette les sert. */
    static final Set<String> READS = Set.of("knowledge.search", "issue.read", "mcp.read");

    private static final String NO_RULE = "No rule of this workspace covers this action, so it waits for the person.";

    private final HarnessRulesService rules;
    private final WorkspaceRepository workspaces;

    /** Ce que le noyau a décidé pour un outil : l'effet, la règle qui l'emporte (nulle si aucune), les faits jugés. */
    public record Verdict(String effect, String ruleId, String reason, Map<String, String> facts) {
        public boolean allowed() {
            return RulesEngine.ALLOW.equals(effect);
        }

        public boolean denied() {
            return RulesEngine.DENY.equals(effect);
        }
    }

    /** Les règles de l'espace, lues une fois par réponse : la dernière version, ou la table par défaut. */
    @Transactional(readOnly = true)
    public RulesBundle rulesFor(AgentContext ctx) {
        Workspace workspace = workspaces.findById(ctx.workspaceId())
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found"));
        return rules.bundleFor(workspace);
    }

    /** Juge un outil : ses faits, puis la règle la plus stricte qui les couvre. */
    public Verdict judge(RulesBundle bundle, AgentTool tool) {
        Map<String, String> facts = facts(tool);
        RulesEngine.Decision decision = RulesEngine.decide(bundle, facts);
        RulesBundle.Rule rule = decision.rule();
        return new Verdict(decision.effect(), rule == null ? null : rule.id(), rule == null ? NO_RULE : rule.reason(), facts);
    }

    /** Les faits d'un outil : son action, son nom et, pour un outil externe, le serveur qui le porte. */
    static Map<String, String> facts(AgentTool tool) {
        String name = tool.name() == null ? "" : tool.name();
        Map<String, String> facts = new LinkedHashMap<>();
        if (tool instanceof ExternalMcpTool external) {
            facts.put("action", external.isReadOnly() ? "mcp.read" : "mcp.write");
            facts.put("server", external.connectorKey());
        } else if (ACTIONS.containsKey(name)) {
            facts.put("action", ACTIONS.get(name));
        }
        facts.put("tool", name);
        return facts;
    }
}
