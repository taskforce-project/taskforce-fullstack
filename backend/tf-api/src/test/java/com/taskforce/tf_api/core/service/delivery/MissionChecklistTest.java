package com.taskforce.tf_api.core.service.delivery;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueChecklistItem;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.service.IssueService;

/** Ce que l'agent d'une mission coche entre au dossier de cette mission, et d'aucune autre. */
@ExtendWith(MockitoExtension.class)
@DisplayName("Les coches de l'agent, au dossier de sa mission")
class MissionChecklistTest {

    @Mock private DeliveryRunRepository runs;
    @Mock private MissionEvidenceService evidence;
    @InjectMocks private MissionChecklist listener;

    private final IssueChecklistItem item = IssueChecklistItem.builder().id(9L).issueId(55L).content("Update the README").done(true).build();

    @Test
    @DisplayName("une ligne de l'issue de la mission : l'agent la déclare au dossier")
    void a_line_of_the_mission_s_issue() {
        DeliveryRun run = DeliveryRun.builder().id(100L).issue(Issue.builder().id(55L).build()).build();
        when(runs.findById(100L)).thenReturn(Optional.of(run));

        listener.onDeclared(new IssueService.ChecklistDeclared(100L, item));

        verify(evidence).checked(run, item);
    }

    @Test
    @DisplayName("une ligne d'une autre issue, ou une mission qui n'existe plus : rien")
    void another_issue_or_no_mission() {
        when(runs.findById(100L)).thenReturn(Optional.of(DeliveryRun.builder().id(100L).issue(Issue.builder().id(56L).build()).build()));
        when(runs.findById(101L)).thenReturn(Optional.empty());

        listener.onDeclared(new IssueService.ChecklistDeclared(100L, item));
        listener.onDeclared(new IssueService.ChecklistDeclared(101L, item));

        verify(evidence, never()).checked(any(), any());
    }
}
