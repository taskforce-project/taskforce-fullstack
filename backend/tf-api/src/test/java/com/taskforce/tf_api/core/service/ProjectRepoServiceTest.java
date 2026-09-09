package com.taskforce.tf_api.core.service;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.request.ProjectRepoLinkRequest;
import com.taskforce.tf_api.core.dto.response.ProjectRepoResponse;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires de {@link ProjectRepoService} (lien Projet ↔ dépôt, TF-AGENT-DELIVERY slice 1).
 * GitHub et la garde d'écriture sont mockés : on vérifie la logique de modes, le scope cross-tenant
 * et le délien.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("ProjectRepoService")
class ProjectRepoServiceTest {

    @Mock private ProjectRepository projectRepository;
    @Mock private GitHubIntegrationService gitHubService;
    @Mock private ProjectVisibilityGuard visibilityGuard;

    @InjectMocks private ProjectRepoService service;

    private static final String SLUG = "acme";
    private static final Long PROJECT_ID = 1L;
    private static final Long USER_ID = 7L;

    private Project projectInWorkspace(String slug) {
        Workspace ws = Workspace.builder().slug(slug).build();
        return Project.builder().id(PROJECT_ID).workspace(ws).name("P").identifier("P").build();
    }

    private ProjectRepoLinkRequest request(String mode, String repoName, String repoFullName) {
        ProjectRepoLinkRequest r = new ProjectRepoLinkRequest();
        r.setMode(mode);
        r.setRepoName(repoName);
        r.setRepoFullName(repoFullName);
        return r;
    }

    @Test
    @DisplayName("CREATE : crée le dépôt GitHub et le lie au projet")
    void link_create_ok() {
        Project project = projectInWorkspace(SLUG);
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(project));
        when(gitHubService.createRepo(SLUG, "new-repo", true)).thenReturn("me/new-repo");

        ProjectRepoResponse res = service.linkRepo(SLUG, PROJECT_ID, USER_ID, request("CREATE", "new-repo", null));

        assertThat(res.repoProvider()).isEqualTo("github");
        assertThat(res.repoFullName()).isEqualTo("me/new-repo");
        assertThat(project.getRepoFullName()).isEqualTo("me/new-repo");
        assertThat(project.getRepoProvider()).isEqualTo("github");
        verify(projectRepository).save(project);
    }

    @Test
    @DisplayName("LINK : valide l'accès puis lie un dépôt existant")
    void link_existing_ok() {
        Project project = projectInWorkspace(SLUG);
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(project));

        ProjectRepoResponse res = service.linkRepo(SLUG, PROJECT_ID, USER_ID, request("LINK", null, "someone/existing"));

        assertThat(res.repoFullName()).isEqualTo("someone/existing");
        assertThat(project.getRepoFullName()).isEqualTo("someone/existing");
        verify(gitHubService).assertRepoAccessible(SLUG, "someone/existing");
    }

    @Test
    @DisplayName("Mode invalide → 400 métier")
    void link_invalidMode() {
        Project project = projectInWorkspace(SLUG);
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(project));

        assertThatThrownBy(() -> service.linkRepo(SLUG, PROJECT_ID, USER_ID, request("FOO", null, null)))
            .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("CREATE sans nom de dépôt → 400 métier")
    void link_createMissingName() {
        Project project = projectInWorkspace(SLUG);
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(project));

        assertThatThrownBy(() -> service.linkRepo(SLUG, PROJECT_ID, USER_ID, request("CREATE", "  ", null)))
            .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("Projet d'un autre workspace → 404 (cross-tenant)")
    void link_crossTenant_404() {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(projectInWorkspace("other-ws")));

        assertThatThrownBy(() -> service.linkRepo(SLUG, PROJECT_ID, USER_ID, request("LINK", null, "a/b")))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("Sans droit d'écriture → refus propagé")
    void link_writeDenied() {
        Project project = projectInWorkspace(SLUG);
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(project));
        doThrow(new ForbiddenException("nope")).when(visibilityGuard).assertCanWrite(project, USER_ID);

        assertThatThrownBy(() -> service.linkRepo(SLUG, PROJECT_ID, USER_ID, request("LINK", null, "a/b")))
            .isInstanceOf(ForbiddenException.class);
    }

    @Test
    @DisplayName("Délien : efface le dépôt du projet")
    void unlink_ok() {
        Project project = projectInWorkspace(SLUG);
        project.setRepoProvider("github");
        project.setRepoFullName("me/old");
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(project));

        ProjectRepoResponse res = service.unlinkRepo(SLUG, PROJECT_ID, USER_ID);

        assertThat(res.repoProvider()).isNull();
        assertThat(res.repoFullName()).isNull();
        assertThat(project.getRepoFullName()).isNull();
        verify(projectRepository).save(project);
    }
}
