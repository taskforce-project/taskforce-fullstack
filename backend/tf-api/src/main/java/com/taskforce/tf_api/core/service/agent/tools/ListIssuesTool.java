package com.taskforce.tf_api.core.service.agent.tools;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.IssueSummaryResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;
import com.taskforce.tf_api.core.service.delivery.DeliveryService;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Outil interne de lecture (TF-MCP-03) : issues natives TaskForce, filtrées comme on les cherche (R52, séance n°8) :
 * par projet (sa clé ou son nom), par colonne, ou les miennes. Sans filtre, mes issues assignées. Une issue ouverte dit
 * ce qui la bloque : les issues dont elle dépend, et l'échec du dernier run de délégation. Une note « known issues » de
 * l'espace n'est pas une issue : Cortex la cherche ailleurs.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ListIssuesTool implements AgentTool {

    /** Projets parcourus pour un filtre de colonne sans projet, et issues détaillées : la réponse reste lisible. */
    private static final int MAX_PROJECTS = 20;
    private static final int MAX_ISSUES = 30;
    private static final int MAX_CAUSE = 160;
    /** « Ce qui a changé » se lit sur trois mois au plus : au-delà, c'est l'historique du projet. */
    static final int MAX_DAYS = 90;

    private final IssueService issueService;
    private final ProjectResolver projects;
    private final DeliveryService deliveryService;

    @Override public String name() { return "list_issues"; }

    /**
     * La description dit aussi à quoi l'outil sert avant un geste : trouver la clé d'une issue que la personne nomme par sa
     * colonne (« l'issue qui est dans In review by AI », test du CEO du 02/11/2026) ou par son titre.
     */
    @Override public String description() {
        return "Lists issues with their keys, by project, column (status) or mine, and what blocks each open one. Finds "
            + "the key of an issue named by its column or title.";
    }

    @Override public Map<String, Object> parametersSchema() {
        return Map.of(
            "type", "object",
            "properties", Map.of(
                "project", Map.of("type", "string", "description", "Optional: the project's key or name"),
                "status",  Map.of("type", "string", "description",
                    "Optional: only the issues in this column, e.g. Blocked or In Progress"),
                "mine",    Map.of("type", "boolean", "description", "Optional: only the issues assigned to me"),
                "changedInDays", Map.of("type", "integer", "description",
                    "Optional: only the issues created or changed in the last N days (7 for this week, 1 for today)")
            )
        );
    }

    @Override public String execute(Map<String, Object> args, AgentContext ctx) {
        String column = text(args.get("status"));
        boolean mine = Boolean.parseBoolean(text(args.get("mine")));
        Integer days = days(args.get("changedInDays"));
        if (days != null && days < 0) return "changedInDays must be a whole number of days, from 1 to " + MAX_DAYS + ".";
        String asked = text(args.get("project"));
        List<IssueResponse> issues;
        String scope;
        boolean severalProjects;
        if (!asked.isEmpty()) {
            ProjectResolver.Resolution where = projects.resolve(asked, ctx);
            if (!where.found()) return where.problem();
            issues = issueService.listIssues(ctx.slug(), where.project().getId(), ctx.userId());
            scope = "in " + where.project().getName();
            severalProjects = false;
        } else if (!column.isEmpty()) {
            issues = new ArrayList<>();
            for (ProjectResponse p : projects.visible(ctx).stream().limit(MAX_PROJECTS).toList()) {
                issues.addAll(issueService.listIssues(ctx.slug(), p.getId(), ctx.userId()));
            }
            scope = "in the workspace";
            severalProjects = true;
        } else {
            issues = issueService.listMyIssues(ctx.slug(), ctx.userId());
            scope = "assigned to you";
            mine = false; // déjà les miennes
            severalProjects = true;
        }
        boolean onlyMine = mine;
        // La colonne se lit comme sur le tableau : sans casse, espaces ni ponctuation (« in review by ai », « To Do »).
        String wanted = IssueFields.key(column);
        // « Qu'est-ce qui a changé cette semaine » (R117) : les issues créées ou changées depuis, les dernières d'abord.
        LocalDateTime since = days == null ? null : LocalDateTime.now(ZoneOffset.UTC).minusDays(days);
        List<IssueResponse> kept = issues.stream()
            .filter(i -> column.isEmpty() || (i.getStatus() != null && wanted.equals(IssueFields.key(i.getStatus().getName()))))
            .filter(i -> !onlyMine || (i.getAssignee() != null && ctx.userId().equals(i.getAssignee().getId())))
            .filter(i -> since == null || (changedAt(i) != null && !changedAt(i).isBefore(since)))
            .toList();
        if (since != null) {
            kept = kept.stream()
                .sorted(Comparator.comparing(ListIssuesTool::changedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        }
        String filter = (column.isEmpty() ? "" : " in the column " + column) + (onlyMine ? " assigned to you" : "")
            + (days == null ? "" : " created or changed in the last " + (days == 1 ? "day" : days + " days"));
        if (kept.isEmpty()) return "No issue " + scope + filter + ".";

        StringBuilder sb = new StringBuilder("Issues " + scope + filter + " (" + kept.size() + "):");
        kept.stream().limit(MAX_ISSUES).forEach(i -> sb.append("\n- ").append(line(i, ctx, severalProjects, since)));
        if (kept.size() > MAX_ISSUES) sb.append("\n... and ").append(kept.size() - MAX_ISSUES).append(" more.");
        return sb.toString();
    }

    private String line(IssueResponse i, AgentContext ctx, boolean withProject, LocalDateTime since) {
        StringBuilder sb = new StringBuilder(i.getIdentifier()).append(" ").append(i.getTitle())
            .append(" [").append(i.getStatus() != null ? i.getStatus().getName() : "?").append("]");
        if (i.getPriority() != null) sb.append(" ").append(i.getPriority());
        if (i.getDueDate() != null) sb.append(", due ").append(i.getDueDate());
        if (withProject && i.getProjectName() != null) sb.append(", project ").append(i.getProjectName());
        if (since != null) {
            // Ce que la ligne dit de ce qui a changé : sa création, ou son dernier changement, à la date près.
            boolean created = i.getCreatedAt() != null && !i.getCreatedAt().isBefore(since);
            sb.append(created ? ", created " + i.getCreatedAt().toLocalDate() : ", changed " + changedAt(i).toLocalDate());
        }
        if (open(i)) sb.append(blockedBecause(i, ctx));
        return sb.toString();
    }

    /** Le dernier changement d'une issue : sa mise à jour, sinon sa création. */
    private static LocalDateTime changedAt(IssueResponse i) {
        return i.getUpdatedAt() != null ? i.getUpdatedAt() : i.getCreatedAt();
    }

    /** Le nombre de jours demandé : absent, null ; mal écrit ou hors bornes, -1. */
    private static Integer days(Object raw) {
        if (raw == null || raw.toString().isBlank()) return null;
        try {
            int days = raw instanceof Number number ? number.intValue() : Integer.parseInt(raw.toString().strip());
            return days >= 1 && days <= MAX_DAYS ? days : -1;
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    /** Ce qui bloque une issue ouverte : les issues dont elle dépend, et l'échec du dernier run. Rien s'il n'y a rien. */
    private String blockedBecause(IssueResponse i, AgentContext ctx) {
        StringBuilder sb = new StringBuilder();
        try {
            List<IssueSummaryResponse> blockers = issueService.listBlockers(ctx.slug(), i.getProjectId(), i.getId(), ctx.userId());
            if (!blockers.isEmpty()) {
                sb.append(", blocked by ").append(blockers.stream().map(IssueSummaryResponse::getIdentifier)
                    .collect(Collectors.joining(", ")));
            }
            deliveryService.latestRun(ctx.slug(), i.getId(), ctx.userId())
                .filter(run -> "FAILED".equals(run.status()) && run.error() != null && !run.error().isBlank())
                .ifPresent(run -> sb.append(run.refused() ? ", the agent did not start: " : ", the agent's run failed: ")
                    .append(shorten(run.error())));
        } catch (RuntimeException e) {
            // La cause est un plus : une issue qu'on ne peut pas détailler reste dans la liste.
            log.debug("Cortex : cause non lue pour {} : {}", LogSafe.of(i.getIdentifier()), LogSafe.of(e.getMessage()));
        }
        return sb.toString();
    }

    private static boolean open(IssueResponse i) {
        IssueStatusCategory c = i.getStatus() != null ? i.getStatus().getCategory() : null;
        return c != IssueStatusCategory.COMPLETED && c != IssueStatusCategory.CANCELLED;
    }

    private static String shorten(String s) {
        String flat = s.replaceAll("\\s+", " ").trim();
        return flat.length() <= MAX_CAUSE ? flat : flat.substring(0, MAX_CAUSE).stripTrailing() + "...";
    }

    private static String text(Object o) {
        return o == null ? "" : o.toString().trim();
    }
}
