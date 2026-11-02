package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.stereotype.Service;

import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.IssueStatusResponse;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Ce que Cortex lit de l'écran de la personne, avant les notes du Brain OS (R114, séance n°17) : le projet ouvert, ses
 * colonnes avec leurs issues (clé, titre, colonne), et l'issue ouverte (clé, titre, colonne, assigné). Le test de la
 * Présidence du 02/11/2026 : « l'issue qu'il y a dans In review by AI » cherchait une note, faute de voir le tableau.
 *
 * <ul>
 *   <li><b>Rien que ce que la personne voit</b> : chaque lecture passe par le service de la route REST, avec ses droits
 *       (projet privé, issue d'un autre projet) ; une lecture refusée ne montre rien, sans le dire au modèle.</li>
 *   <li><b>Résumé, avec un plafond</b> : un petit modèle meurt d'un contexte qui enfle (Rus). Vingt issues au plus, les
 *       dernières changées d'abord, des titres coupés, et un plafond de caractères au-delà duquel les plus anciennes
 *       tombent ; le reste se lit avec {@code list_issues}.</li>
 * </ul>
 *
 * <p>Aucune transaction ne l'englobe (PC-022) : chaque service ouvre la sienne, courte, avant l'appel au modèle.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ScreenContext {

    /** Les issues montrées au plus : de quoi reconnaître celle dont la personne parle, pas tout le tableau. */
    static final int MAX_ISSUES = 20;
    /** Un titre au-delà se coupe : la clé et le début suffisent à le reconnaître. */
    static final int MAX_TITLE = 60;
    /** Le plafond du bloc entier, environ 400 tokens : au-delà, les issues les plus anciennes tombent. */
    static final int MAX_CHARS = 1500;

    private static final String HEADER = "On screen, what the person sees now. When they say \"this\", \"it\" or name an "
        + "issue by its column or its title, it is one of these: use its key.\n";

    private final ProjectService projectService;
    private final IssueService issueService;

    /** Le bloc de l'écran pour le modèle ; vide sans écran, ou quand la personne ne voit pas ce qu'il désigne. */
    public String describe(AgentContext ctx) {
        Screen screen = ctx.screen();
        if (screen.isEmpty()) return "";
        try {
            ProjectResponse project = projectService.getProject(ctx.slug(), screen.projectId(), ctx.userId());
            List<IssueStatusResponse> columns = issueService.listStatuses(ctx.slug(), project.getId(), ctx.userId());
            List<IssueResponse> issues = issueService.listIssues(ctx.slug(), project.getId(), ctx.userId());
            IssueResponse open = screen.issueId() == null ? null : open(ctx, project.getId(), screen.issueId());
            return text(project, columns, issues, open);
        } catch (RuntimeException e) {
            // Un projet qu'elle ne voit pas (ou plus) : l'écran ne dit rien, la réponse se fait sans lui.
            log.debug("Cortex : écran non lu (projet {}) : {}", screen.projectId(), LogSafe.of(e.getMessage()));
            return "";
        }
    }

    private IssueResponse open(AgentContext ctx, Long projectId, Long issueId) {
        try {
            return issueService.getIssue(ctx.slug(), projectId, issueId, ctx.userId());
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * Le bloc, sous son plafond : les issues les dernières changées d'abord, rangées par colonne dans l'ordre du tableau.
     * Tant que le bloc dépasse le plafond, l'issue la plus ancienne tombe.
     */
    static String text(ProjectResponse project, List<IssueStatusResponse> columns, List<IssueResponse> issues,
                       IssueResponse open) {
        List<IssueResponse> recent = issues.stream()
            .filter(issue -> !issue.isArchived())
            .sorted(Comparator.comparing(ScreenContext::changedAt, Comparator.nullsLast(Comparator.reverseOrder())))
            .limit(MAX_ISSUES)
            .toList();
        int total = (int) issues.stream().filter(issue -> !issue.isArchived()).count();
        String text = text(project, columns, recent, total, open);
        List<IssueResponse> shown = new ArrayList<>(recent);
        while (text.length() > MAX_CHARS && !shown.isEmpty()) {
            shown.remove(shown.size() - 1);
            text = text(project, columns, shown, total, open);
        }
        return text.length() > MAX_CHARS ? text.substring(0, MAX_CHARS) : text;
    }

    private static String text(ProjectResponse project, List<IssueStatusResponse> columns, List<IssueResponse> shown,
                               int total, IssueResponse open) {
        StringBuilder sb = new StringBuilder(HEADER);
        sb.append("Project ").append(project.getIdentifier()).append(" \"").append(clip(project.getName())).append("\".\n");
        Map<Long, List<IssueResponse>> byColumn = new LinkedHashMap<>();
        columns.stream().sorted(Comparator.comparing(IssueStatusResponse::getPosition, Comparator.nullsLast(Comparator.naturalOrder())))
            .forEach(column -> byColumn.put(column.getId(), new ArrayList<>()));
        for (IssueResponse issue : shown) {
            Long column = issue.getStatus() == null ? null : issue.getStatus().getId();
            if (column != null && byColumn.containsKey(column)) byColumn.get(column).add(issue);
        }
        sb.append(shown.size() < total
            ? "Columns, with the " + shown.size() + " most recently changed of its " + total + " issues:\n"
            : "Columns, with their issues:\n");
        for (IssueStatusResponse column : columns.stream()
                .sorted(Comparator.comparing(IssueStatusResponse::getPosition, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList()) {
            List<IssueResponse> in = byColumn.get(column.getId());
            sb.append("- ").append(column.getName()).append(": ");
            if (in.isEmpty()) {
                sb.append("none");
            } else {
                for (int i = 0; i < in.size(); i++) {
                    if (i > 0) sb.append("; ");
                    sb.append(in.get(i).getIdentifier()).append(' ').append(clip(in.get(i).getTitle()));
                }
            }
            sb.append('\n');
        }
        if (shown.size() < total) sb.append("The other issues: list_issues reads them.\n");
        if (open != null) {
            sb.append("Open issue: ").append(open.getIdentifier()).append(" \"").append(clip(open.getTitle())).append("\"")
                .append(open.getStatus() == null ? "" : ", in " + open.getStatus().getName())
                .append(open.getAssignee() == null ? ", unassigned" : ", assigned to " + assignee(open))
                .append(".\n");
        }
        return sb.toString();
    }

    /** Quand l'issue a changé pour la dernière fois : son changement, sinon sa création. */
    private static LocalDateTime changedAt(IssueResponse issue) {
        return issue.getUpdatedAt() != null ? issue.getUpdatedAt() : issue.getCreatedAt();
    }

    private static String assignee(IssueResponse issue) {
        String name = issue.getAssignee().getDisplayName();
        return name != null && !name.isBlank() ? clip(name) : Objects.toString(issue.getAssignee().getEmail(), "someone");
    }

    private static String clip(String value) {
        if (value == null) return "";
        String flat = value.replaceAll("\\s+", " ").strip();
        return flat.length() <= MAX_TITLE ? flat : flat.substring(0, MAX_TITLE).stripTrailing() + "...";
    }
}
