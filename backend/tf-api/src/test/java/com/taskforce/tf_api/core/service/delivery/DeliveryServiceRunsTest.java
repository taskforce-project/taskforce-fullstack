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
