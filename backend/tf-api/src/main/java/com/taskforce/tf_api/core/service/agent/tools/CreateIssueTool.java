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
        return "Creates an issue in a TaskForce project. Requires projectId (see list_projects) and title. "
            + "Optional: description, priority (NONE, LOW, MEDIUM, HIGH, URGENT). This is the default TaskForce "
            + "action; to create it in an external tool, use the matching \"<service>__\" tool.";
    }

    @Override public Map<String, Object> parametersSchema() {
        return Map.of(
            "type", "object",
            "properties", Map.of(
                "projectId",   Map.of("type", "integer", "description", "Target project (see list_projects)"),
                "title",       Map.of("type", "string", "description", "Issue title"),
                "description", Map.of("type", "string", "description", "Markdown description (optional)"),
                "priority",    Map.of("type", "string", "description", "NONE|LOW|MEDIUM|HIGH|URGENT (optional)")
            ),
            "required", List.of("projectId", "title")
        );
    }

    @Override public String execute(Map<String, Object> args, AgentContext ctx) {
        Long projectId = asLong(args.get("projectId"));
        if (projectId == null) return "projectId is missing: call list_projects first to find it.";
        String title = args.get("title") != null ? String.valueOf(args.get("title")).trim() : "";
        if (title.isEmpty()) return "title is missing: an issue needs a title.";

        CreateIssueRequest req = new CreateIssueRequest();
        req.setTitle(title);
        if (args.get("description") != null) req.setDescription(String.valueOf(args.get("description")));
        IssuePriority priority = parsePriority(args.get("priority"));
        if (priority != null) req.setPriority(priority);

        IssueResponse issue = issueService.createIssue(ctx.slug(), projectId, req, ctx.userId());
        return "Issue created in TaskForce: " + issue.getIdentifier() + " \"" + issue.getTitle()
            + "\" (id " + issue.getId() + ").";
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
