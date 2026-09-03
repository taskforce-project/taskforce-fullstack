package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;

import lombok.RequiredArgsConstructor;

/**
 * Outil interne de lecture (TF-MCP-03) : issues natives TaskForce. Sans {@code projectId}, renvoie
 * MES issues assignées dans le workspace ; avec {@code projectId}, les issues de ce projet. Outil
 * <b>natif</b> TaskForce (pendant lecture de l'équivalent externe, ex. {@code linear__list_issues}).
 */
@Component
@RequiredArgsConstructor
public class ListIssuesTool implements AgentTool {

    private final IssueService issueService;

    @Override public String name() { return "list_issues"; }

    @Override public String description() {
        return "Liste des issues TaskForce. Sans projectId : mes issues assignées dans le workspace. "
            + "Avec projectId (voir list_projects) : les issues de ce projet.";
    }

    @Override public Map<String, Object> parametersSchema() {
        return Map.of(
            "type", "object",
            "properties", Map.of(
                "projectId", Map.of("type", "integer", "description", "Optionnel : restreindre à ce projet")
            )
        );
    }

    @Override public String execute(Map<String, Object> args, AgentContext ctx) {
        Long projectId = asLong(args.get("projectId"));
        List<IssueResponse> issues = (projectId != null)
            ? issueService.listIssues(ctx.slug(), projectId, ctx.userId())
            : issueService.listMyIssues(ctx.slug(), ctx.userId());
        if (issues.isEmpty()) {
            return projectId != null ? "Aucune issue dans ce projet." : "Aucune issue ne t'est assignée.";
        }
        StringBuilder sb = new StringBuilder("Issues (" + issues.size() + ") :");
        for (IssueResponse i : issues) {
            String status = i.getStatus() != null ? i.getStatus().getName() : "?";
            sb.append("\n- ").append(i.getIdentifier()).append(" ").append(i.getTitle())
              .append(" [").append(status).append("]");
            if (i.getPriority() != null) sb.append(" ").append(i.getPriority());
        }
        return sb.toString();
    }

    private static Long asLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(o.toString().trim()); } catch (NumberFormatException e) { return null; }
    }
}
