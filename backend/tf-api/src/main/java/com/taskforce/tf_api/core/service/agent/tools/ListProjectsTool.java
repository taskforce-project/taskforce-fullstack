package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;

import lombok.RequiredArgsConstructor;

/**
 * Outil interne de lecture (TF-MCP-03) : liste les projets du workspace TaskForce, pour que l'agent
 * trouve le {@code projectId} avant de créer ou lister des issues. Outil <b>natif</b> TaskForce, sans
 * lien avec un service externe : il rend le côté « maison » du routage aussi capable que les outils MCP.
 */
@Component
@RequiredArgsConstructor
public class ListProjectsTool implements AgentTool {

    private final ProjectService projectService;

    @Override public String name() { return "list_projects"; }

    @Override public String description() {
        return "Lists the projects of the TaskForce workspace (id, identifier, name, number of issues). "
            + "Useful to find the projectId before creating or listing issues.";
    }

    @Override public Map<String, Object> parametersSchema() {
        return Map.of("type", "object", "properties", Map.of());
    }

    @Override public String execute(Map<String, Object> args, AgentContext ctx) {
        List<ProjectResponse> projects = projectService.listProjects(ctx.slug(), ctx.userId());
        if (projects.isEmpty()) return "No project in this workspace.";
        StringBuilder sb = new StringBuilder("Projects (" + projects.size() + "):");
        for (ProjectResponse p : projects) {
            sb.append("\n- ").append(p.getIdentifier()).append(" ").append(p.getName())
              .append(" (id ").append(p.getId()).append(", ")
              .append(p.getOpenIssues()).append("/").append(p.getTotalIssues()).append(" open)");
        }
        return sb.toString();
    }
}
