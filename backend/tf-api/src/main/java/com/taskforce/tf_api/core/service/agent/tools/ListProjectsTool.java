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
        return "Liste les projets du workspace TaskForce (id, identifiant, nom, nombre d'issues). "
            + "Utile pour trouver le projectId avant de créer ou lister des issues.";
    }

    @Override public Map<String, Object> parametersSchema() {
        return Map.of("type", "object", "properties", Map.of());
    }

    @Override public String execute(Map<String, Object> args, AgentContext ctx) {
        List<ProjectResponse> projects = projectService.listProjects(ctx.slug(), ctx.userId());
        if (projects.isEmpty()) return "Aucun projet dans ce workspace.";
        StringBuilder sb = new StringBuilder("Projets (" + projects.size() + ") :");
        for (ProjectResponse p : projects) {
            sb.append("\n- ").append(p.getIdentifier()).append(" ").append(p.getName())
              .append(" (id ").append(p.getId()).append(", ")
              .append(p.getOpenIssues()).append("/").append(p.getTotalIssues()).append(" ouvertes)");
        }
        return sb.toString();
    }
}
