package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;

import lombok.RequiredArgsConstructor;

/**
 * Outil interne d'écriture (TF-MCP-03) : crée une issue <b>native</b> dans un projet TaskForce. C'est
 * la cible <b>par défaut</b> de « crée une issue » (le pendant interne de {@code linear__save_issue} et
 * consorts). L'autorisation d'écriture sur le projet est vérifiée par {@code IssueService}.
 */
@Component
@RequiredArgsConstructor
public class CreateIssueTool implements AgentTool {

    private final IssueService issueService;

    @Override public String name() { return "create_issue"; }

    @Override public String description() {
        return "Crée une issue dans un projet TaskForce. Requiert projectId (voir list_projects) et title. "
            + "Optionnels : description, priority (NONE, LOW, MEDIUM, HIGH, URGENT). C'est l'action TaskForce "
            + "par défaut ; pour créer côté externe, utiliser l'outil « <service>__ » dédié.";
    }

    @Override public Map<String, Object> parametersSchema() {
        return Map.of(
            "type", "object",
            "properties", Map.of(
                "projectId",   Map.of("type", "integer", "description", "Projet cible (voir list_projects)"),
                "title",       Map.of("type", "string", "description", "Titre de l'issue"),
                "description", Map.of("type", "string", "description", "Description markdown (optionnel)"),
                "priority",    Map.of("type", "string", "description", "NONE|LOW|MEDIUM|HIGH|URGENT (optionnel)")
            ),
            "required", List.of("projectId", "title")
        );
    }

    @Override public String execute(Map<String, Object> args, AgentContext ctx) {
        Long projectId = asLong(args.get("projectId"));
        if (projectId == null) return "projectId manquant : appelle d'abord list_projects pour le trouver.";
        String title = args.get("title") != null ? String.valueOf(args.get("title")).trim() : "";
        if (title.isEmpty()) return "title manquant : impossible de créer une issue sans titre.";

        CreateIssueRequest req = new CreateIssueRequest();
        req.setTitle(title);
        if (args.get("description") != null) req.setDescription(String.valueOf(args.get("description")));
        IssuePriority priority = parsePriority(args.get("priority"));
        if (priority != null) req.setPriority(priority);

        IssueResponse issue = issueService.createIssue(ctx.slug(), projectId, req, ctx.userId());
        return "Issue créée dans TaskForce : " + issue.getIdentifier() + " « " + issue.getTitle()
            + " » (id " + issue.getId() + ").";
    }

    private static IssuePriority parsePriority(Object o) {
        if (o == null) return null;
        try {
            return IssuePriority.valueOf(o.toString().trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null; // valeur inconnue → priorité par défaut du service
        }
    }

    private static Long asLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(o.toString().trim()); } catch (NumberFormatException e) { return null; }
    }
}
