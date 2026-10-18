package com.taskforce.tf_api.core.service.delivery;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.DeliveryProviderResponse;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Délégation à un agent qui n'est pas prêt (OSS-5.7) : refusée tout de suite, avec ce qu'il faut faire, au lieu d'un
 * run qui attendrait pour rien ; et la liste des agents dit, pour la personne, lesquels sont prêts.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("DeliveryService - agents prêts")
class DeliveryServiceDelegateTest {

    @Mock private DeliveryRunRepository runRepository;
    @Mock private IssueRepository issueRepository;
    @Mock private UserRepository userRepository;
    @Mock private DeliveryAgentProviderRegistry registry;
    @Mock private ProjectVisibilityGuard visibilityGuard;
    @Mock private BrainAccessGuard access;
    @Mock private ProjectRepository projectRepository;

    @InjectMocks private DeliveryService service;

    private Workspace workspace;
    private Project project;
    private DeliveryAgentProvider claude;

    @BeforeEach
    void setUp() {
        workspace = Workspace.builder().id(3L).slug("acme").build();
        project = Project.builder().id(12L).workspace(workspace).build();
        claude = mock(DeliveryAgentProvider.class);
    }

    @Test
    void delegating_to_an_agent_that_is_not_ready_says_what_to_do() {
        when(issueRepository.findById(55L)).thenReturn(Optional.of(Issue.builder().id(55L).project(project).build()));
        when(registry.get("claude-code")).thenReturn(claude);
        when(claude.available()).thenReturn(true);
        when(claude.unavailableReason(any())).thenReturn("Set up your local runner first (Settings > Agents).");

        assertThatThrownBy(() -> service.delegate("acme", 55L, "claude-code", null, 7L))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("Set up your local runner first");
        verify(claude).unavailableReason(argThat(ctx -> ctx.userId() == 7L && ctx.project() == project && ctx.workspace() == workspace));
        verify(runRepository, never()).save(any());
    }

    @Test
    void the_list_tells_for_each_agent_whether_it_is_ready() {
        when(access.resolveAndAuthorize("acme", 7L)).thenReturn(workspace);
        when(projectRepository.findById(12L)).thenReturn(Optional.of(project));
        DeliveryAgentProvider copilot = mock(DeliveryAgentProvider.class);
        when(claude.key()).thenReturn("claude-code");
        when(claude.unavailableReason(any())).thenReturn(null);
        when(copilot.key()).thenReturn("github-copilot");
        when(copilot.unavailableReason(any())).thenReturn("Link a GitHub repository to this project first.");
        when(registry.all()).thenReturn(List.of(claude, copilot));

        List<DeliveryProviderResponse> providers = service.listProviders("acme", 12L, 7L);

        assertThat(providers).extracting(DeliveryProviderResponse::key).containsExactly("claude-code", "github-copilot");
        assertThat(providers).extracting(DeliveryProviderResponse::ready).containsExactly(true, false);
        assertThat(providers.get(1).reason()).contains("Link a GitHub repository");
    }

    @Test
    void a_project_of_another_workspace_is_not_found() {
        when(access.resolveAndAuthorize("acme", 7L)).thenReturn(workspace);
        Project foreign = Project.builder().id(99L).workspace(Workspace.builder().id(4L).build()).build();
        when(projectRepository.findById(99L)).thenReturn(Optional.of(foreign));

        assertThatThrownBy(() -> service.listProviders("acme", 99L, 7L)).isInstanceOf(ResourceNotFoundException.class);
    }
}
