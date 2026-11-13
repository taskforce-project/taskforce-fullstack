package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.taskforce.tf_api.core.dto.request.CreateIssueRelationRequest;
import com.taskforce.tf_api.core.dto.response.IssueRealtimeEvent;
import com.taskforce.tf_api.core.dto.response.ProjectIssueRelationsResponse;
import com.taskforce.tf_api.core.enums.IssueActivityType;
import com.taskforce.tf_api.core.enums.IssueRelationType;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueActivity;
import com.taskforce.tf_api.core.model.IssueRelation;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IssueActivityRepository;
import com.taskforce.tf_api.core.repository.IssueRelationRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

/**
 * Un lien entre deux issues (la vue du workflow, R166) : posé ou retiré, il entre à l'activité des deux issues, chacune de
 * son côté, et le topic du projet l'annonce après le commit, avec le lien ; il ne se retire que depuis une issue du projet.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Un lien entre deux issues : gardé des deux côtés, annoncé après le commit")
class IssueServiceRelationsTest {

    @Mock private IssueRepository issueRepository;
    @Mock private IssueRelationRepository relationRepository;
    @Mock private IssueActivityRepository activityRepository;
    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private WorkspaceMemberRepository workspaceMemberRepository;
    @Mock private UserRepository userRepository;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private ProjectVisibilityGuard visibilityGuard;
    @Mock private ApplicationEventPublisher events;

    @InjectMocks private IssueService service;

    private final User pierre = User.builder().id(1L).email("pierre@acme.dev").displayName("Pierre").build();
    private final Workspace workspace = Workspace.builder().id(4L).slug("acme").build();
    private final Project web = Project.builder().id(3L).identifier("WEB").workspace(workspace).build();
    private final IssueStatus todo = IssueStatus.builder().id(9L).name("Todo").build();
    private final Issue design = Issue.builder().id(11L).sequenceNumber(11).title("Design the export").project(web).status(todo).build();
    private final Issue build = Issue.builder().id(12L).sequenceNumber(12).title("Build the export").project(web).status(todo).build();

    @BeforeEach
    void aProjectToWriteIn() {
        lenient().when(workspaceRepository.findBySlug("acme")).thenReturn(Optional.of(workspace));
        lenient().when(projectRepository.findByIdAndWorkspaceId(3L, 4L)).thenReturn(Optional.of(web));
        lenient().when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(4L, 1L)).thenReturn(true);
        lenient().when(issueRepository.findById(11L)).thenReturn(Optional.of(design));
        lenient().when(issueRepository.findById(12L)).thenReturn(Optional.of(build));
        lenient().when(userRepository.findById(1L)).thenReturn(Optional.of(pierre));
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void clear() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.clearSynchronization();
    }

    private static CreateIssueRelationRequest blocks(Long target) {
        CreateIssueRelationRequest request = new CreateIssueRelationRequest();
        request.setTargetIssueId(target);
        request.setRelationType("BLOCKS");
        return request;
    }

    private IssueRelation relation(long id, Issue source, Issue target, IssueRelationType type) {
        return IssueRelation.builder().id(id).source(source).target(target).relationType(type).createdBy(pierre)
            .createdAt(LocalDateTime.of(2026, 11, 13, 10, 0)).build();
    }

    private List<IssueActivity> logged() {
        ArgumentCaptor<IssueActivity> activity = ArgumentCaptor.forClass(IssueActivity.class);
        verify(activityRepository, times(2)).save(activity.capture());
        return activity.getAllValues();
    }

    private IssueRealtimeEvent announced() {
        ArgumentCaptor<IssueRealtimeEvent> event = ArgumentCaptor.forClass(IssueRealtimeEvent.class);
        verify(messagingTemplate, org.mockito.Mockito.atLeastOnce()).convertAndSend(eq("/topic/projects.3"), event.capture());
        return event.getAllValues().stream().filter(e -> e.getAction().startsWith("relation.")).findFirst().orElseThrow();
    }

    @Test
    @DisplayName("posé : l'activité des deux issues, chacune de son côté, puis le lien annoncé après le commit")
    void a_link_set_is_kept_on_both_sides_and_announced_after_the_commit() {
        when(relationRepository.save(any(IssueRelation.class))).thenAnswer(saved -> {
            IssueRelation r = saved.getArgument(0);
            r.setId(5L);
            r.setCreatedAt(LocalDateTime.of(2026, 11, 13, 10, 0));
            return r;
        });

        service.addRelation("acme", 3L, 11L, blocks(12L), 1L);

        assertThat(logged()).extracting(a -> a.getIssue().getId() + " " + a.getAction() + " " + a.getNewValue())
            .containsExactly("11 RELATION_ADDED BLOCKS WEB-12", "12 RELATION_ADDED BLOCKED_BY WEB-11");
        // Rien n'est annoncé avant le commit : la relecture des liens trouverait l'état d'avant.
        verify(messagingTemplate, never()).convertAndSend(anyString(), any(Object.class));
        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);

        IssueRealtimeEvent event = announced();
        assertThat(event.getAction()).isEqualTo("relation.added");
        assertThat(event.getIssueId()).isEqualTo(11L);
        assertThat(event.getIssue()).isNull();
        ProjectIssueRelationsResponse.Relation link = event.getRelation();
        assertThat(link.id()).isEqualTo(5L);
        assertThat(link.relationType()).isEqualTo(IssueRelationType.BLOCKS);
        assertThat(link.source().getIdentifier()).isEqualTo("WEB-11");
        assertThat(link.target().getIdentifier()).isEqualTo("WEB-12");
        assertThat(link.createdBy().getEmail()).isEqualTo("pierre@acme.dev");
    }

    @Test
    @DisplayName("retiré depuis la cible : l'activité des deux issues, et le lien retiré annoncé après le commit")
    void a_link_removed_is_kept_on_both_sides_and_announced() {
        IssueRelation duplicate = relation(6L, build, design, IssueRelationType.DUPLICATE);
        when(relationRepository.findWithEndsById(6L)).thenReturn(Optional.of(duplicate));

        service.deleteRelation("acme", 3L, 11L, 6L, 1L);

        verify(relationRepository).delete(duplicate);
        assertThat(logged()).extracting(a -> a.getIssue().getId() + " " + a.getAction() + " " + a.getOldValue())
            .containsExactly("12 RELATION_REMOVED DUPLICATE_OF WEB-11", "11 RELATION_REMOVED DUPLICATED_BY WEB-12");
        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
        IssueRealtimeEvent event = announced();
        assertThat(event.getAction()).isEqualTo("relation.removed");
        assertThat(event.getIssueId()).isEqualTo(11L);
        assertThat(event.getRelation().id()).isEqualTo(6L);
    }

    @Test
    @DisplayName("🔒 un lien ne se retire que depuis une issue du projet du chemin (IDOR)")
    void a_link_is_removed_only_from_an_issue_of_the_path_project() {
        Project elsewhere = Project.builder().id(30L).identifier("HER").workspace(Workspace.builder().id(40L).build()).build();
        Issue hers = Issue.builder().id(31L).sequenceNumber(1).project(elsewhere).status(todo).build();
        when(issueRepository.findById(31L)).thenReturn(Optional.of(hers));

        assertThatThrownBy(() -> service.deleteRelation("acme", 3L, 31L, 6L, 1L))
            .isInstanceOf(ResourceNotFoundException.class).hasMessage("Issue not found");
        verify(relationRepository, never()).findWithEndsById(any());
        verify(relationRepository, never()).delete(any());
    }

    @Test
    @DisplayName("🔒 un lien qui ne touche pas l'issue du chemin n'existe pas ici")
    void a_link_that_does_not_touch_the_path_issue_is_not_found() {
        Issue other = Issue.builder().id(13L).sequenceNumber(13).project(web).status(todo).build();
        when(relationRepository.findWithEndsById(7L)).thenReturn(Optional.of(relation(7L, build, other, IssueRelationType.BLOCKS)));

        assertThatThrownBy(() -> service.deleteRelation("acme", 3L, 11L, 7L, 1L))
            .isInstanceOf(ResourceNotFoundException.class).hasMessage("Relation not found");
        verify(relationRepository, never()).delete(any());
        verify(activityRepository, never()).save(any());
    }

    @ParameterizedTest(name = "{0} : la source dit {1}, la cible {2}")
    @CsvSource({
        "BLOCKS,     BLOCKS,       BLOCKED_BY",
        "BLOCKED_BY, BLOCKED_BY,   BLOCKS",
        "DUPLICATE,  DUPLICATE_OF, DUPLICATED_BY",
        "RELATES_TO, RELATES_TO,   RELATES_TO",
    })
    @DisplayName("chaque lien se dit de chaque côté")
    void each_link_reads_from_each_side(IssueRelationType type, String fromSource, String fromTarget) {
        assertThat(IssueService.sourceView(type)).isEqualTo(fromSource);
        assertThat(IssueService.targetView(type)).isEqualTo(fromTarget);
    }

    @Test
    @DisplayName("hors transaction, le lien s'annonce tout de suite")
    void outside_a_transaction_the_link_is_announced_at_once() {
        TransactionSynchronizationManager.clearSynchronization();
        when(relationRepository.save(any(IssueRelation.class))).thenAnswer(saved -> saved.getArgument(0));

        service.addRelation("acme", 3L, 11L, blocks(12L), 1L);

        assertThat(announced().getAction()).isEqualTo("relation.added");
    }
}
