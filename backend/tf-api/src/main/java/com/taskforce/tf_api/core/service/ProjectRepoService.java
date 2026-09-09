package com.taskforce.tf_api.core.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.ProjectRepoLinkRequest;
import com.taskforce.tf_api.core.dto.response.ProjectRepoResponse;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Lien Projet ↔ dépôt de code (TF-AGENT-DELIVERY, slice 1). Façon Linear : on peut créer un dépôt ou
 * en lier un existant, à la création du projet OU plus tard. Le dépôt sert de défaut au coding agent.
 *
 * <p>Service <b>dédié</b> (plutôt que d'ajouter GitHub à {@link ProjectService}) pour isoler la nouvelle
 * dépendance GitHub et ne pas casser les tests slicés existants. Lier/délier un dépôt = <b>écriture</b>
 * sur le projet (LEAD / ADMIN / OWNER), garde via {@link ProjectVisibilityGuard}.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProjectRepoService {

    private static final String PROVIDER_GITHUB = "github";

    private final ProjectRepository        projectRepository;
    private final GitHubIntegrationService gitHubService;
    private final ProjectVisibilityGuard   visibilityGuard;

    @Transactional
    public ProjectRepoResponse linkRepo(String workspaceSlug, Long projectId, Long userId,
                                        ProjectRepoLinkRequest request) {
        Project project = resolveWritableProject(workspaceSlug, projectId, userId);
        String mode = request.getMode() == null ? "" : request.getMode().trim().toUpperCase();

        String fullName;
        if ("CREATE".equals(mode)) {
            if (isBlank(request.getRepoName())) {
                throw new BusinessException("Le nom du dépôt à créer est obligatoire");
            }
            fullName = gitHubService.createRepo(workspaceSlug, request.getRepoName().trim(), request.isPrivateRepo());
        } else if ("LINK".equals(mode)) {
            if (isBlank(request.getRepoFullName())) {
                throw new BusinessException("Le dépôt à lier (owner/name) est obligatoire");
            }
            fullName = request.getRepoFullName().trim();
            gitHubService.assertRepoAccessible(workspaceSlug, fullName);
        } else {
            throw new BusinessException("Mode invalide : attendu CREATE ou LINK");
        }

        project.setRepoProvider(PROVIDER_GITHUB);
        project.setRepoFullName(fullName);
        projectRepository.save(project);
        log.info("Projet {} lié au dépôt {}:{}", projectId, PROVIDER_GITHUB, fullName);
        return new ProjectRepoResponse(project.getId(), PROVIDER_GITHUB, fullName);
    }

    @Transactional
    public ProjectRepoResponse unlinkRepo(String workspaceSlug, Long projectId, Long userId) {
        Project project = resolveWritableProject(workspaceSlug, projectId, userId);
        project.setRepoProvider(null);
        project.setRepoFullName(null);
        projectRepository.save(project);
        log.info("Projet {} : dépôt délié", projectId);
        return new ProjectRepoResponse(project.getId(), null, null);
    }

    /**
     * Charge le projet en le scopant au workspace du chemin (cross-tenant → 404, pas 403) et exige un
     * droit d'écriture. Miroir du garde-fou de {@code GitHubIntegrationService} sur les liens d'issue.
     */
    private Project resolveWritableProject(String workspaceSlug, Long projectId, Long userId) {
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResourceNotFoundException("Projet introuvable"));
        if (project.getWorkspace() == null || !workspaceSlug.equals(project.getWorkspace().getSlug())) {
            throw new ResourceNotFoundException("Projet introuvable");
        }
        visibilityGuard.assertCanWrite(project, userId);
        return project;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
