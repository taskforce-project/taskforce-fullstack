package com.taskforce.tf_api.core.service.delivery;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.DeliveryRunResponse;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;

import org.springframework.data.domain.Pageable;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Vue « workflow » au niveau workspace : {@link DeliveryService#listRuns} borne les runs de délégation
 * aux projets visibles (jamais de fuite d'un projet privé) et mappe le DTO dans la transaction.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("DeliveryService - listRuns (vue workflow)")
class DeliveryServiceRunsTest {

    @Mock private DeliveryRunRepository runRepository;
    @Mock private IssueRepository issueRepository;
    @Mock private UserRepository userRepository;
    @Mock private DeliveryAgentProviderRegistry registry;
    @Mock private ProjectVisibilityGuard visibilityGuard;
    @Mock private BrainAccessGuard access;
    @Mock private IntegrationRepository integrationRepository;

    @InjectMocks private DeliveryService service;

    @Test
    @DisplayName("listRuns : borne aux projets visibles et mappe les runs")
    void listRuns_scopes_to_viewable_projects() {
        Workspace ws = mock(Workspace.class);
        when(ws.getId()).thenReturn(5L);
        when(access.resolveAndAuthorize("acme", 1L)).thenReturn(ws);
        when(visibilityGuard.viewableProjectIds(5L, 1L)).thenReturn(List.of(3L, 4L));

        Issue issue = mock(Issue.class);
        when(issue.getId()).thenReturn(42L);
        DeliveryRun run = DeliveryRun.builder()
            .id(9L).issue(issue).providerKey("claude-code").model("sonnet")
            .status(DeliveryRunStatus.RUNNING).build();
        when(runRepository.findByProjectIds(eq(List.of(3L, 4L)), any(Pageable.class)))
            .thenReturn(List.of(run));

        List<DeliveryRunResponse> res = service.listRuns("acme", 1L);

        assertThat(res).hasSize(1);
        assertThat(res.get(0).issueId()).isEqualTo(42L);
        assertThat(res.get(0).providerKey()).isEqualTo("claude-code");
        assertThat(res.get(0).status()).isEqualTo("RUNNING");
        // Issue sans projet chargé (cas dégradé) : pas de clé ni de projet, mais jamais d'exception.
        assertThat(res.get(0).issueKey()).isNull();
        assertThat(res.get(0).projectId()).isNull();
    }

    @Test
    @DisplayName("listRuns : le run porte la clé, le titre et le projet de l'issue (lisible et cliquable)")
    void listRuns_carries_issue_key_title_and_project() {
        Workspace ws = mock(Workspace.class);
        when(ws.getId()).thenReturn(5L);
        when(access.resolveAndAuthorize("acme", 1L)).thenReturn(ws);
        when(visibilityGuard.viewableProjectIds(5L, 1L)).thenReturn(List.of(3L));

        Project project = mock(Project.class);
        when(project.getId()).thenReturn(3L);
        when(project.getName()).thenReturn("Website");
        when(project.getIdentifier()).thenReturn("WEB");
        Issue issue = mock(Issue.class);
        when(issue.getId()).thenReturn(42L);
        when(issue.getSequenceNumber()).thenReturn(12);
        when(issue.getTitle()).thenReturn("Fix the footer links");
        when(issue.getProject()).thenReturn(project);
        DeliveryRun run = DeliveryRun.builder()
            .id(9L).issue(issue).providerKey("claude-code").status(DeliveryRunStatus.DONE)
            .summary("Done.").resultUrl("https://github.com/acme/website/pull/9").build();
        when(runRepository.findByProjectIds(eq(List.of(3L)), any(Pageable.class))).thenReturn(List.of(run));

        DeliveryRunResponse res = service.listRuns("acme", 1L).get(0);

        assertThat(res.issueKey()).isEqualTo("WEB-12");
        assertThat(res.issueTitle()).isEqualTo("Fix the footer links");
        assertThat(res.projectId()).isEqualTo(3L);
        assertThat(res.projectName()).isEqualTo("Website");
        assertThat(res.resultUrl()).isEqualTo("https://github.com/acme/website/pull/9");
    }

    @Test
    @DisplayName("listRuns : aucun projet visible → liste vide, aucune requête runs")
    void listRuns_no_viewable_projects_short_circuits() {
        Workspace ws = mock(Workspace.class);
        when(ws.getId()).thenReturn(5L);
        when(access.resolveAndAuthorize("acme", 1L)).thenReturn(ws);
        when(visibilityGuard.viewableProjectIds(5L, 1L)).thenReturn(List.of());

        List<DeliveryRunResponse> res = service.listRuns("acme", 1L);

        assertThat(res).isEmpty();
        verify(runRepository, never()).findByProjectIds(any(), any());
    }
}
