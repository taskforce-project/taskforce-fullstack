package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import com.taskforce.tf_api.core.dto.request.UpdateChecklistItemRequest;
import com.taskforce.tf_api.core.enums.IssueActivityType;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueActivity;
import com.taskforce.tf_api.core.model.IssueChecklistItem;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IssueActivityRepository;
import com.taskforce.tf_api.core.repository.IssueChecklistItemRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.security.DeliverySessionFilter;

/**
 * L'activité d'une issue dit qui a fait quoi : une action faite par l'agent d'une mission, au nom de la personne qui
 * l'a déléguée, garde le nom de l'agent ({@code via}) ; la personne seule n'en a pas.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Activité d'une issue : par qui l'action est passée")
class IssueServiceActivityViaTest {

    @Mock private IssueRepository issueRepository;
    @Mock private IssueActivityRepository activityRepository;
    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private WorkspaceMemberRepository workspaceMemberRepository;
    @Mock private UserRepository userRepository;
    @Mock private IssueChecklistItemRepository checklistRepository;
    @Mock private ProjectVisibilityGuard visibilityGuard;

    @InjectMocks private IssueService service;

    private final User pierre = User.builder().id(7L).email("pierre@acme.dev").build();

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private IssueActivity saved() {
        ArgumentCaptor<IssueActivity> activity = ArgumentCaptor.forClass(IssueActivity.class);
        verify(activityRepository).save(activity.capture());
        return activity.getValue();
    }

    /** La session déléguée d'une mission de Claude Code, au nom de Pierre. */
    private static void delegatedSession() {
        Jwt delegated = Jwt.withTokenValue("t").header("alg", "none").claim("email", "pierre@acme.dev")
            .claim(DeliverySessionFilter.RUN_CLAIM, 100L).claim(DeliverySessionFilter.AGENT_CLAIM, "Claude Code").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(delegated, List.of(), "pierre@acme.dev"));
    }

    @Test
    @DisplayName("dans la session déléguée d'une mission : l'action est celle de la personne, passée par son agent")
    void a_delegated_session_names_the_agent() {
        delegatedSession();

        service.assignDelegatorIfUnassigned(Issue.builder().id(55L).build(), pierre);

        IssueActivity activity = saved();
        assertThat(activity.getActor()).isEqualTo(pierre);
        assertThat(activity.getVia()).isEqualTo("Claude Code");
    }

    @Test
    @DisplayName("l'agent coche une ligne de la checklist : « Claude Code checked », au nom de Pierre")
    void the_agent_checks_a_checklist_item() {
        delegatedSession();
        Workspace acme = Workspace.builder().id(1L).slug("acme").build();
        Project testta = Project.builder().id(3L).workspace(acme).build();
        Issue issue = Issue.builder().id(55L).project(testta).build();
        IssueChecklistItem item = IssueChecklistItem.builder().id(9L).issueId(55L).content("Update the README").done(false).build();
        when(workspaceRepository.findBySlug("acme")).thenReturn(Optional.of(acme));
        when(projectRepository.findByIdAndWorkspaceId(3L, 1L)).thenReturn(Optional.of(testta));
        when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(1L, 7L)).thenReturn(true);
        when(issueRepository.findById(55L)).thenReturn(Optional.of(issue));
        when(checklistRepository.findByIdAndIssueId(9L, 55L)).thenReturn(Optional.of(item));
        when(checklistRepository.save(item)).thenReturn(item);
        when(userRepository.findById(7L)).thenReturn(Optional.of(pierre));
        UpdateChecklistItemRequest check = new UpdateChecklistItemRequest();
        check.setDone(true);

        assertThat(service.updateChecklistItem("acme", 3L, 55L, 9L, 7L, check).isDone()).isTrue();

        IssueActivity activity = saved();
        assertThat(activity.getAction()).isEqualTo(IssueActivityType.CHECKLIST_CHECKED);
        assertThat(activity.getNewValue()).isEqualTo("Update the README");
        assertThat(activity.getActor()).isEqualTo(pierre);
        assertThat(activity.getVia()).isEqualTo("Claude Code");
    }

    @Test
    @DisplayName("la personne seule : aucun agent")
    void a_person_alone_has_no_agent() {
        service.assignDelegatorIfUnassigned(Issue.builder().id(55L).build(), pierre);

        assertThat(saved().getVia()).isNull();
    }

    @Test
    @DisplayName("un agent nommé par l'appelant, et des valeurs coupées à la taille de leur colonne")
    void an_explicit_agent_and_clipped_values() {
        Issue issue = Issue.builder().id(55L).build();

        service.logActivity(issue, pierre, IssueActivityType.PULL_REQUEST_OPENED, null, "x".repeat(600), "A".repeat(80));

        IssueActivity activity = saved();
        assertThat(activity.getAction()).isEqualTo(IssueActivityType.PULL_REQUEST_OPENED);
        assertThat(activity.getNewValue()).hasSize(500);
        assertThat(activity.getVia()).hasSize(60);
        assertThat(activity.getOldValue()).isNull();
    }
}
