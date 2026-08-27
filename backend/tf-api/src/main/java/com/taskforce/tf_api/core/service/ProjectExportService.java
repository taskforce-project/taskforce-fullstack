package com.taskforce.tf_api.core.service;

import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.IssueExport;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.ProjectExport;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Export COMPLET d'un projet (issues + descriptions + commentaires + activité) en JSON ou CSV — pour que
 * les bêta-testeurs reprennent leur travail dans un autre outil à la fermeture de la bêta (P1b).
 *
 * <p>Réutilise {@link IssueService} qui gère <b>déjà l'autorisation</b> ({@code listIssues} lève 404 si le
 * projet n'est pas visible) : aucune règle d'accès dupliquée. Chemin FROID (one-shot par testeur) → le N+1
 * par issue (commentaires + activité) est acceptable à l'échelle d'un projet.</p>
 */
@Service
@RequiredArgsConstructor
public class ProjectExportService {

    private final IssueService issueService;
    private final ProjectRepository projectRepository;
    private final WorkspaceRepository workspaceRepository;

    @Transactional(readOnly = true)
    public ProjectExport export(String slug, Long projectId, Long userId) {
        // listIssues AUTORISE (assertCanView) ET renvoie toutes les issues du projet (vue kanban).
        List<IssueResponse> issues = issueService.listIssues(slug, projectId, userId);

        Project project = workspaceRepository.findBySlug(slug)
            .flatMap(ws -> projectRepository.findByIdAndWorkspaceId(projectId, ws.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Projet introuvable"));

        List<IssueExport> detailed = issues.stream()
            .map(i -> new IssueExport(
                i,
                issueService.listComments(slug, projectId, i.getId(), userId),
                issueService.listActivity(slug, projectId, i.getId(), userId)))
            .toList();

        return new ProjectExport(
            project.getIdentifier(), project.getName(), project.getDescription(),
            Instant.now().toString(), detailed.size(), detailed);
    }

    /**
     * CSV « à plat » (une ligne par issue), pour tableur — plus riche que l'export client existant :
     * ajoute la description et le nombre de commentaires.
     */
    public String toCsv(ProjectExport export) {
        StringBuilder sb = new StringBuilder(
            "Identifier,Title,Status,Priority,Assignee,Reporter,Labels,StoryPoints,DueDate,CreatedAt,CompletedAt,Comments,Description\n");
        for (IssueExport ie : export.issues()) {
            IssueResponse i = ie.issue();
            String status   = i.getStatus() != null ? i.getStatus().getName() : "";
            String priority = i.getPriority() != null ? i.getPriority().name() : "";
            String assignee = i.getAssignee() != null ? nz(i.getAssignee().getDisplayName(), i.getAssignee().getEmail()) : "";
            String reporter = i.getReporter() != null ? nz(i.getReporter().getDisplayName(), i.getReporter().getEmail()) : "";
            String labels   = i.getLabels() == null ? ""
                : i.getLabels().stream().map(l -> l.getName()).collect(Collectors.joining("; "));
            sb.append(csv(i.getIdentifier())).append(',')
              .append(csv(i.getTitle())).append(',')
              .append(csv(status)).append(',')
              .append(csv(priority)).append(',')
              .append(csv(assignee)).append(',')
              .append(csv(reporter)).append(',')
              .append(csv(labels)).append(',')
              .append(i.getStoryPoints() != null ? i.getStoryPoints().toString() : "").append(',')
              .append(i.getDueDate() != null ? i.getDueDate().toString() : "").append(',')
              .append(i.getCreatedAt() != null ? i.getCreatedAt().toString() : "").append(',')
              .append(i.getCompletedAt() != null ? i.getCompletedAt().toString() : "").append(',')
              .append(ie.comments() != null ? ie.comments().size() : 0).append(',')
              .append(csv(i.getDescription())).append('\n');
        }
        return sb.toString();
    }

    /** Échappement CSV (RFC 4180) : encadre de guillemets si virgule / guillemet / saut de ligne. */
    private static String csv(String v) {
        if (v == null) return "";
        if (v.contains(",") || v.contains("\"") || v.contains("\n") || v.contains("\r")) {
            return "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }

    private static String nz(String a, String b) {
        return (a != null && !a.isBlank()) ? a : (b != null ? b : "");
    }
}
