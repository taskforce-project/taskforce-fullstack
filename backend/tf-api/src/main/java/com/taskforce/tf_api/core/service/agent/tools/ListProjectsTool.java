package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.response.CycleResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.ProjectLabelResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.enums.CycleStatus;
import com.taskforce.tf_api.core.service.CycleService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Outil interne de lecture (TF-MCP-03) : les projets du workspace TaskForce, avec de quoi placer une issue dans le
 * temps (R48, séance n°8) : le but du projet (sa description), ses colonnes et son cycle actif. Les autres outils
 * désignent un projet par sa clé ou son nom : aucun identifiant n'est montré au modèle, il n'a rien à deviner.
 *
 * <p>Avec ses labels et ses membres (recette du 01/11/2026) : la carte d'une issue ne se remplit que de ce qui existe,
 * et Cortex voit quand une personne nommée désigne plusieurs membres, pour le demander avant de préparer la carte.</p>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ListProjectsTool implements AgentTool {

    private static final int MAX_PROJECTS = 20;
    private static final int MAX_GOAL = 140;
    /** Les labels et les membres d'un projet montrés au modèle, au plus : de quoi choisir sans saturer son contexte. */
    private static final int MAX_NAMES = 15;

    private final ProjectResolver projects;
    private final IssueService issueService;
    private final CycleService cycleService;
    private final ProjectService projectService;

    @Override public String name() { return "list_projects"; }

    @Override public String description() {
        return "Lists the workspace's projects: key, name, goal, columns, active cycle, labels, members and open issues. "
            + "The other tools take the key or the name.";
    }

    @Override public Map<String, Object> parametersSchema() {
        return Map.of("type", "object", "properties", Map.of());
    }

    @Override public String execute(Map<String, Object> args, AgentContext ctx) {
        List<ProjectResponse> visible = projects.visible(ctx);
        if (visible.isEmpty()) return "No project in this workspace.";
        StringBuilder sb = new StringBuilder("Projects (" + visible.size() + "):");
        for (ProjectResponse p : visible.stream().limit(MAX_PROJECTS).toList()) {
            sb.append("\n- ").append(p.getIdentifier()).append(" ").append(p.getName())
              .append(": ").append(p.getOpenIssues()).append("/").append(p.getTotalIssues()).append(" open")
              .append(timing(p, ctx))
              .append(people(p, ctx));
            String goal = goal(p.getDescription());
            if (!goal.isEmpty()) sb.append("; goal: ").append(goal);
        }
        if (visible.size() > MAX_PROJECTS) sb.append("\n... and ").append(visible.size() - MAX_PROJECTS).append(" more.");
        return sb.toString();
    }

    /** Les colonnes et le cycle actif d'un projet ; vide s'ils ne se lisent pas, le projet reste listé. */
    private String timing(ProjectResponse p, AgentContext ctx) {
        StringBuilder sb = new StringBuilder();
        try {
            String columns = issueService.listStatuses(ctx.slug(), p.getId(), ctx.userId()).stream()
                .map(IssueStatusResponse::getName).collect(Collectors.joining(", "));
            if (!columns.isEmpty()) sb.append("; columns: ").append(columns);
            cycleService.listCycles(ctx.slug(), p.getId(), ctx.userId()).stream()
                .filter(c -> c.getStatus() == CycleStatus.ACTIVE).findFirst()
                .ifPresent(c -> sb.append("; active cycle: ").append(cycle(c)));
        } catch (RuntimeException e) {
            log.debug("Cortex : colonnes ou cycle non lus pour {} : {}", LogSafe.of(p.getIdentifier()), LogSafe.of(e.getMessage()));
        }
        return sb.toString();
    }

    /** Les labels et les membres d'un projet, par leur nom ; vide s'ils ne se lisent pas, le projet reste listé. */
    private String people(ProjectResponse p, AgentContext ctx) {
        StringBuilder sb = new StringBuilder();
        try {
            String labels = names(projectService.listLabels(ctx.slug(), p.getId(), ctx.userId()).stream()
                .map(ProjectLabelResponse::getName).toList());
            if (!labels.isEmpty()) sb.append("; labels: ").append(labels);
            String members = names(projectService.listMembers(ctx.slug(), p.getId(), ctx.userId()).stream()
                .map(m -> m.getDisplayName() != null && !m.getDisplayName().isBlank() ? m.getDisplayName() : m.getEmail())
                .toList());
            if (!members.isEmpty()) sb.append("; members: ").append(members);
        } catch (RuntimeException e) {
            log.debug("Cortex : labels ou membres non lus pour {} : {}", LogSafe.of(p.getIdentifier()), LogSafe.of(e.getMessage()));
        }
        return sb.toString();
    }

    private static String names(List<String> names) {
        String shown = names.stream().limit(MAX_NAMES).collect(Collectors.joining(", "));
        return names.size() > MAX_NAMES ? shown + " and " + (names.size() - MAX_NAMES) + " more" : shown;
    }

    private static String cycle(CycleResponse c) {
        return c.getName() + " (" + c.getStartDate() + " to " + c.getEndDate() + ")";
    }

    /** La description d'un projet tient lieu de but : sa première phrase utile, sur une ligne. */
    private static String goal(String description) {
        if (description == null) return "";
        String flat = description.replaceAll("\\s+", " ").trim();
        return flat.length() <= MAX_GOAL ? flat : flat.substring(0, MAX_GOAL).stripTrailing() + "...";
    }
}
