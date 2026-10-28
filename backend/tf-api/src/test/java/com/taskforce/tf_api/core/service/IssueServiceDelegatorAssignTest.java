package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.enums.IssueActivityType;
import com.taskforce.tf_api.core.model.AssignmentStatus;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueActivity;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.IssueActivityRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;

/** Décision J4 de l'atelier design : une issue déléguée sans assigné prend pour assigné la personne qui délègue. */
@ExtendWith(MockitoExtension.class)
@DisplayName("Assignation à la personne qui délègue")
class IssueServiceDelegatorAssignTest {

    @Mock private IssueRepository issueRepository;
    @Mock private IssueActivityRepository activityRepository;

    @InjectMocks private IssueService service;

    private final User ada = User.builder().id(7L).email("ada@acme.dev").build();

    @Test
    @DisplayName("sans assigné : la personne qui délègue, acceptée d'office, et l'historique le garde")
    void an_unassigned_issue_goes_to_the_delegator() {
        Issue issue = Issue.builder().id(55L).build();

        service.assignDelegatorIfUnassigned(issue, ada);

        assertThat(issue.getAssignee()).isEqualTo(ada);
        assertThat(issue.getAssignedBy()).isEqualTo(ada);
        assertThat(issue.getAssignmentStatus()).isEqualTo(AssignmentStatus.ACCEPTED);
        ArgumentCaptor<IssueActivity> activity = ArgumentCaptor.forClass(IssueActivity.class);
        verify(activityRepository).save(activity.capture());
        assertThat(activity.getValue().getAction()).isEqualTo(IssueActivityType.ASSIGNEE_CHANGED);
        assertThat(activity.getValue().getNewValue()).isEqualTo("ada@acme.dev");
        verify(issueRepository).save(issue);
    }

    @Test
    @DisplayName("déjà assignée : rien ne change")
    void an_assigned_issue_keeps_its_assignee() {
        User linus = User.builder().id(8L).email("linus@acme.dev").build();
        Issue issue = Issue.builder().id(55L).assignee(linus).build();

        service.assignDelegatorIfUnassigned(issue, ada);

        assertThat(issue.getAssignee()).isEqualTo(linus);
        verify(issueRepository, never()).save(any());
        verify(activityRepository, never()).save(any());
    }
}
