package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

import java.util.List;

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

import com.taskforce.tf_api.core.enums.IssueActivityType;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueActivity;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.IssueActivityRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
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

    @Test
    @DisplayName("dans la session déléguée d'une mission : l'action est celle de la personne, passée par son agent")
    void a_delegated_session_names_the_agent() {
        Jwt delegated = Jwt.withTokenValue("t").header("alg", "none").claim("email", "pierre@acme.dev")
            .claim(DeliverySessionFilter.RUN_CLAIM, 100L).claim(DeliverySessionFilter.AGENT_CLAIM, "Claude Code").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(delegated, List.of(), "pierre@acme.dev"));

        service.assignDelegatorIfUnassigned(Issue.builder().id(55L).build(), pierre);

        IssueActivity activity = saved();
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
