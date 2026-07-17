package com.taskforce.tf_api.core.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.CreatePageRequest;
import com.taskforce.tf_api.core.dto.request.UpdatePageRequest;
import com.taskforce.tf_api.core.dto.response.PageResponse;
import com.taskforce.tf_api.core.model.Page;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.PageRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Pages de projet (documentation libre).
 *
 * <p><b>Contrôle d'accès</b> — chaque opération résout le projet <b>via le slug du workspace</b>
 * ({@link #resolveProject}) puis délègue à {@link ProjectVisibilityGuard}, comme {@link IssueService}.
 * Les deux étapes sont nécessaires et aucune ne remplace l'autre :
 *
 * <ul>
 *   <li>{@code WorkspaceAccessInterceptor} ne vérifie que l'appartenance au workspace <b>du slug</b> —
 *       il ne regarde <b>jamais</b> le {@code projectId}. Sans le {@code findByIdAndWorkspaceId} ci-dessous,
 *       n'importe quel membre d'un workspace quelconque atteignait les pages de <b>tous</b> les projets
 *       (cf. {@code PC-021} : {@code DELETE /api/workspaces/son-ws/projects/42/pages/7} supprimait la
 *       page 7 d'un projet privé d'autrui).</li>
 *   <li>La garde de visibilité ajoute la règle projet (privé → 404, VIEWER → lecture seule).</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PageService {

    private final PageRepository         pageRepository;
    private final ProjectRepository      projectRepository;
    private final WorkspaceRepository    workspaceRepository;
    private final UserRepository         userRepository;
    private final ProjectVisibilityGuard visibilityGuard;

    // =========================================================================
    // Queries
    // =========================================================================

    public List<PageResponse> listPages(String workspaceSlug, Long projectId, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        visibilityGuard.assertCanView(project, userId);

        return pageRepository.findByProjectIdOrderByUpdatedAtDesc(project.getId())
            .stream()
            .map(PageResponse::from)
            .toList();
    }

    public PageResponse getPage(String workspaceSlug, Long projectId, Long pageId, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        visibilityGuard.assertCanView(project, userId);
        return PageResponse.from(resolvePage(pageId, project.getId()));
    }

    // =========================================================================
    // Commands
    // =========================================================================

    @Transactional
    public PageResponse createPage(String workspaceSlug, Long projectId, Long userId, CreatePageRequest request) {
        Project project = resolveProject(workspaceSlug, projectId);
        visibilityGuard.assertCanWrite(project, userId);

        User author = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        Page page = Page.builder()
            .project(project)
            .createdBy(author)
            .title(request.getTitle())
            .emoji(request.getEmoji() != null ? request.getEmoji() : "📄")
            .content(request.getContent())
            .build();

        return PageResponse.from(pageRepository.save(page));
    }

    @Transactional
    public PageResponse updatePage(String workspaceSlug, Long projectId, Long pageId, Long userId,
                                   UpdatePageRequest request) {
        Project project = resolveProject(workspaceSlug, projectId);
        visibilityGuard.assertCanWrite(project, userId);

        Page page = resolvePage(pageId, project.getId());

        if (request.getTitle() != null && !request.getTitle().isBlank()) {
            page.setTitle(request.getTitle());
        }
        if (request.getEmoji() != null) {
            page.setEmoji(request.getEmoji());
        }
        if (request.getContent() != null) {
            page.setContent(request.getContent());
        }

        return PageResponse.from(pageRepository.save(page));
    }

    @Transactional
    public void deletePage(String workspaceSlug, Long projectId, Long pageId, Long userId) {
        Project project = resolveProject(workspaceSlug, projectId);
        visibilityGuard.assertCanWrite(project, userId);
        pageRepository.delete(resolvePage(pageId, project.getId()));
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /** Le {@code findByIdAndWorkspaceId} est le cœur du correctif : il lie le projet au slug de l'URL. */
    private Project resolveProject(String workspaceSlug, Long projectId) {
        return workspaceRepository.findBySlug(workspaceSlug)
            .flatMap(ws -> projectRepository.findByIdAndWorkspaceId(projectId, ws.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("Projet introuvable"));
    }

    private Page resolvePage(Long pageId, Long projectId) {
        return pageRepository.findByIdAndProjectId(pageId, projectId)
            .orElseThrow(() -> new ResourceNotFoundException("Page introuvable"));
    }
}
