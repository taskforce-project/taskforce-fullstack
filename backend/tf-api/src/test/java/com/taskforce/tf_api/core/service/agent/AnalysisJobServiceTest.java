package com.taskforce.tf_api.core.service.agent;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.EditPriorityRequest;
import com.taskforce.tf_api.core.dto.response.AnalysisJobResponse;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.dto.response.StoredPriorityResponse;
import com.taskforce.tf_api.core.enums.AnalysisDepth;
import com.taskforce.tf_api.core.enums.AnalysisJobStatus;
import com.taskforce.tf_api.core.enums.DecisionPriorityStatus;
import com.taskforce.tf_api.core.model.AnalysisJob;
import com.taskforce.tf_api.core.model.DecisionBriefEntity;
import com.taskforce.tf_api.core.model.DecisionPriority;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.AnalysisJobRepository;
import com.taskforce.tf_api.core.repository.DecisionBriefRepository;
import com.taskforce.tf_api.core.repository.DecisionPriorityRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.AiGenerationService;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link AnalysisJobService} : cycle de vie des workflows d'analyse (launch/answer/
 * dismiss) et actions sur les priorités décisionnelles (accept idempotent, pin, dismiss, edit),
 * avec les garde-fous métier (état, RBAC de visibilité).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("AnalysisJobService")
class AnalysisJobServiceTest {

    @Mock private BrainAccessGuard access;
    @Mock private AnalysisJobRepository jobRepository;
    @Mock private DecisionBriefRepository briefRepository;
    @Mock private DecisionPriorityRepository priorityRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private UserRepository userRepository;
    @Mock private IssueRepository issueRepository;
    @Mock private IssueService issueService;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Spy  private ObjectMapper objectMapper = new ObjectMapper();
    @Mock private ProjectVisibilityGuard visibilityGuard;
    @Mock private AiGenerationService aiGenerationService;
    @InjectMocks private AnalysisJobService service;

    private final Workspace ws = Workspace.builder().id(5L).slug("acme").build();
    private final Project project = Project.builder().id(1L).name("Web").identifier("WEB").workspace(ws).build();
    private final User user = User.builder().id(9L).build();

    @BeforeEach
    void setup() {
        when(access.resolveAndAuthorize("acme", 9L)).thenReturn(ws);
        when(jobRepository.save(any(AnalysisJob.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private DecisionPriority priority(DecisionPriorityStatus status) {
        DecisionBriefEntity brief = DecisionBriefEntity.builder()
            .id(2L).workspace(ws).project(project).mode("generated").build();
        return DecisionPriority.builder()
            .id(3L).brief(brief).title("Traiter la dette").rationale("bloque le reste")
            .level("HIGH").status(status).position(0).build();
    }

    // ---- launch ----

    @Test
    @DisplayName("launch : crée un workflow QUEUED, profondeur QUICK par défaut")
    void launch_creates_queued_job() {
        when(projectRepository.findByIdAndWorkspaceId(1L, 5L)).thenReturn(Optional.of(project));
        when(userRepository.findById(9L)).thenReturn(Optional.of(user));

        AnalysisJobResponse res = service.launch("acme", 1L, 9L, null);

        assertThat(res.status()).isEqualTo(AnalysisJobStatus.QUEUED.name());
        assertThat(res.depth()).isEqualTo(AnalysisDepth.QUICK.name());
        verify(jobRepository, atLeastOnce()).save(any(AnalysisJob.class));
    }

    @Test
    @DisplayName("launch : projet inconnu → ResourceNotFoundException")
    void launch_unknown_project() {
        when(projectRepository.findByIdAndWorkspaceId(1L, 5L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.launch("acme", 1L, 9L, AnalysisDepth.DEEP))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("launch : utilisateur inconnu → ResourceNotFoundException")
    void launch_unknown_user() {
        when(projectRepository.findByIdAndWorkspaceId(1L, 5L)).thenReturn(Optional.of(project));
        when(userRepository.findById(9L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.launch("acme", 1L, 9L, null))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    // ---- answer / dismiss ----

    @Test
    @DisplayName("answer : un workflow en attente repasse en RUNNING")
    void answer_resumes_running() {
        AnalysisJob job = AnalysisJob.builder()
            .id(4L).workspace(ws).project(project).depth(AnalysisDepth.DEEP)
            .status(AnalysisJobStatus.WAITING_FOR_INPUT).build();
        when(jobRepository.findByIdAndWorkspaceId(4L, 5L)).thenReturn(Optional.of(job));

        AnalysisJobResponse res = service.answer("acme", 4L, 9L, "focus sur la sécu");

        assertThat(res.status()).isEqualTo(AnalysisJobStatus.RUNNING.name());
        assertThat(job.getAnswer()).isEqualTo("focus sur la sécu");
        assertThat(job.getQuestion()).isNull();
    }

    @Test
    @DisplayName("answer : un workflow qui n'attend pas → BusinessException")
    void answer_wrong_state() {
        AnalysisJob job = AnalysisJob.builder()
            .id(4L).workspace(ws).project(project).depth(AnalysisDepth.QUICK)
            .status(AnalysisJobStatus.DONE).build();
        when(jobRepository.findByIdAndWorkspaceId(4L, 5L)).thenReturn(Optional.of(job));

        assertThatThrownBy(() -> service.answer("acme", 4L, 9L, "x"))
            .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("dismiss : workflow terminé → retiré du dock")
    void dismiss_inactive() {
        AnalysisJob job = AnalysisJob.builder()
            .id(4L).workspace(ws).project(project).depth(AnalysisDepth.QUICK)
            .status(AnalysisJobStatus.DONE).build();
        when(jobRepository.findByIdAndWorkspaceId(4L, 5L)).thenReturn(Optional.of(job));

        service.dismiss("acme", 4L, 9L);

        assertThat(job.isDismissed()).isTrue();
    }

    @Test
    @DisplayName("dismiss : workflow en cours → BusinessException")
    void dismiss_active() {
        AnalysisJob job = AnalysisJob.builder()
            .id(4L).workspace(ws).project(project).depth(AnalysisDepth.QUICK)
            .status(AnalysisJobStatus.RUNNING).build();
        when(jobRepository.findByIdAndWorkspaceId(4L, 5L)).thenReturn(Optional.of(job));

        assertThatThrownBy(() -> service.dismiss("acme", 4L, 9L))
            .isInstanceOf(BusinessException.class);
    }

    // ---- priorités ----

    @Test
    @DisplayName("accept : la priorité devient une issue et passe ACCEPTED")
    void accept_creates_issue() {
        DecisionPriority p = priority(DecisionPriorityStatus.NEW);
        when(priorityRepository.findByIdAndWorkspaceId(3L, 5L)).thenReturn(Optional.of(p));
        IssueResponse issueResp = org.mockito.Mockito.mock(IssueResponse.class);
        when(issueResp.getId()).thenReturn(100L);
        when(issueService.createIssue(eq("acme"), eq(1L), any(), eq(9L))).thenReturn(issueResp);
        Issue created = Issue.builder().id(100L).project(project).sequenceNumber(42).build();
        when(issueRepository.findById(100L)).thenReturn(Optional.of(created));

        StoredPriorityResponse res = service.accept("acme", 3L, 9L);

        assertThat(res.status()).isEqualTo(DecisionPriorityStatus.ACCEPTED.name());
        assertThat(p.getStatus()).isEqualTo(DecisionPriorityStatus.ACCEPTED);
        assertThat(p.getIssue()).isEqualTo(created);
    }

    @Test
    @DisplayName("accept : idempotent — déjà acceptée, aucune nouvelle issue")
    void accept_idempotent() {
        DecisionPriority p = priority(DecisionPriorityStatus.ACCEPTED);
        when(priorityRepository.findByIdAndWorkspaceId(3L, 5L)).thenReturn(Optional.of(p));

        service.accept("acme", 3L, 9L);

        verify(issueService, never()).createIssue(any(), anyLong(), any(), anyLong());
    }

    @Test
    @DisplayName("pin : bascule NEW ↔ PINNED")
    void pin_toggles() {
        DecisionPriority p = priority(DecisionPriorityStatus.NEW);
        when(priorityRepository.findByIdAndWorkspaceId(3L, 5L)).thenReturn(Optional.of(p));

        service.pin("acme", 3L, 9L);
        assertThat(p.getStatus()).isEqualTo(DecisionPriorityStatus.PINNED);

        service.pin("acme", 3L, 9L);
        assertThat(p.getStatus()).isEqualTo(DecisionPriorityStatus.NEW);
    }

    @Test
    @DisplayName("dismissPriority : une priorité déjà acceptée ne peut être écartée")
    void dismiss_priority_accepted_rejected() {
        DecisionPriority p = priority(DecisionPriorityStatus.ACCEPTED);
        when(priorityRepository.findByIdAndWorkspaceId(3L, 5L)).thenReturn(Optional.of(p));

        assertThatThrownBy(() -> service.dismissPriority("acme", 3L, 9L))
            .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("dismissPriority : bascule NEW → DISMISSED")
    void dismiss_priority_toggles() {
        DecisionPriority p = priority(DecisionPriorityStatus.NEW);
        when(priorityRepository.findByIdAndWorkspaceId(3L, 5L)).thenReturn(Optional.of(p));

        service.dismissPriority("acme", 3L, 9L);

        assertThat(p.getStatus()).isEqualTo(DecisionPriorityStatus.DISMISSED);
    }

    @Test
    @DisplayName("edit : met à jour titre + justification (hors état accepté)")
    void edit_updates() {
        DecisionPriority p = priority(DecisionPriorityStatus.NEW);
        when(priorityRepository.findByIdAndWorkspaceId(3L, 5L)).thenReturn(Optional.of(p));
        EditPriorityRequest req = org.mockito.Mockito.mock(EditPriorityRequest.class);
        when(req.getTitle()).thenReturn("Nouveau titre");
        when(req.getRationale()).thenReturn("nouvelle raison");

        service.edit("acme", 3L, 9L, req);

        assertThat(p.getTitle()).isEqualTo("Nouveau titre");
        assertThat(p.getRationale()).isEqualTo("nouvelle raison");
    }

    @Test
    @DisplayName("edit : une priorité acceptée ne peut plus être éditée")
    void edit_accepted_rejected() {
        DecisionPriority p = priority(DecisionPriorityStatus.ACCEPTED);
        when(priorityRepository.findByIdAndWorkspaceId(3L, 5L)).thenReturn(Optional.of(p));
        EditPriorityRequest req = org.mockito.Mockito.mock(EditPriorityRequest.class);

        assertThatThrownBy(() -> service.edit("acme", 3L, 9L, req))
            .isInstanceOf(BusinessException.class);
    }
}
