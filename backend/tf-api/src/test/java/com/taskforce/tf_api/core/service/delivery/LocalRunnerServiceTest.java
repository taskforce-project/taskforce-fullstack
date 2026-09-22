package com.taskforce.tf_api.core.service.delivery;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.request.RunnerResultRequest;
import com.taskforce.tf_api.core.dto.response.RunnerClaimResponse;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Côté serveur du runner local (ADR-013) : un runner n'agit que sur les runs délégués par SON
 * propriétaire, réclamés par LUI, encore en cours.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("LocalRunnerService")
class LocalRunnerServiceTest {

    private static final String OWNER_EMAIL = "pierre@taskforce.dev";
    private static final RunnerIdentity RUNNER = new RunnerIdentity("tf-runner-pierre", OWNER_EMAIL);

    @Mock private DeliveryRunRepository runRepository;
    @Mock private UserRepository userRepository;
    @Mock private ProjectVisibilityGuard visibilityGuard;
    @Mock private DeliveryRunner deliveryRunner;

    private LocalRunnerService service;
    private User owner;

    @BeforeEach
    void setUp() {
        LocalRunnerSettings settings = new LocalRunnerSettings(true, "delivery-runner", "tf-runner-", "tf_runner_owner", 120, 10);
        service = new LocalRunnerService(runRepository, userRepository, visibilityGuard, deliveryRunner, settings);
        owner = User.builder().id(7L).email(OWNER_EMAIL).keycloakId("kc-7").isActive(true).build();
    }

    private DeliveryRun run(Long id, DeliveryRunStatus status, String claimedBy, User startedBy, LocalDateTime claimedAt) {
        Workspace ws = mock(Workspace.class);
        lenient().when(ws.getSlug()).thenReturn("acme");
        Project project = mock(Project.class);
        lenient().when(project.getId()).thenReturn(12L);
        lenient().when(project.getName()).thenReturn("Website");
        lenient().when(project.getIdentifier()).thenReturn("WEB");
        lenient().when(project.getRepoFullName()).thenReturn("acme/website");
        lenient().when(project.getWorkspace()).thenReturn(ws);
        Issue issue = mock(Issue.class);
        lenient().when(issue.getId()).thenReturn(55L);
        lenient().when(issue.getSequenceNumber()).thenReturn(4);
        lenient().when(issue.getTitle()).thenReturn("Fix the footer");
        lenient().when(issue.getDescription()).thenReturn("Details");
        lenient().when(issue.getProject()).thenReturn(project);
        return DeliveryRun.builder()
            .id(id).issue(issue).providerKey("claude-code").model("claude-sonnet-5")
            .status(status).claimedBy(claimedBy).claimedAt(claimedAt).startedBy(startedBy).build();
    }

    // ── claim ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("claim : réclame le plus ancien run du propriétaire et rend le brief de la tâche")
    void claim_returns_task_brief() {
        DeliveryRun queued = run(100L, DeliveryRunStatus.QUEUED, null, owner, null);
        when(userRepository.findByEmail(OWNER_EMAIL)).thenReturn(Optional.of(owner));
        when(runRepository.findClaimable(eq("claude-code"), eq(DeliveryRunStatus.QUEUED), eq(7L), any()))
            .thenReturn(List.of(queued));
        when(visibilityGuard.canWrite(any(Project.class), eq(7L))).thenReturn(true);
        when(runRepository.claim(eq(100L), eq("tf-runner-pierre"), anyString(), any(),
            eq(DeliveryRunStatus.QUEUED), eq(DeliveryRunStatus.RUNNING))).thenReturn(1);

        RunnerClaimResponse claim = service.claim(RUNNER).orElseThrow();

        assertThat(claim.runId()).isEqualTo(100L);
        assertThat(claim.issueKey()).isEqualTo("WEB-4");
        assertThat(claim.workspaceSlug()).isEqualTo("acme");
        assertThat(claim.projectId()).isEqualTo(12L);
        assertThat(claim.repoFullName()).isEqualTo("acme/website");
        assertThat(claim.sessionExpiresAt()).isAfter(LocalDateTime.now().plusMinutes(100));
        ArgumentCaptor<String> ref = ArgumentCaptor.forClass(String.class);
        verify(runRepository).claim(eq(100L), anyString(), ref.capture(), any(), any(), any());
        assertThat(ref.getValue()).startsWith("runner:tf-runner-pierre:");
    }

    @Test
    @DisplayName("claim : aucun run en attente -> vide")
    void claim_empty_queue() {
        when(userRepository.findByEmail(OWNER_EMAIL)).thenReturn(Optional.of(owner));
        when(runRepository.findClaimable(anyString(), any(), anyLong(), any())).thenReturn(List.of());

        assertThat(service.claim(RUNNER)).isEmpty();
    }

    @Test
    @DisplayName("claim : droits réévalués, un run dont le délégant a perdu l'écriture est clos en échec")
    void claim_fails_run_when_owner_lost_write_access() {
        DeliveryRun queued = run(101L, DeliveryRunStatus.QUEUED, null, owner, null);
        when(userRepository.findByEmail(OWNER_EMAIL)).thenReturn(Optional.of(owner));
        when(runRepository.findClaimable(anyString(), any(), anyLong(), any())).thenReturn(List.of(queued));
        when(visibilityGuard.canWrite(any(Project.class), eq(7L))).thenReturn(false);

        assertThat(service.claim(RUNNER)).isEmpty();

        ArgumentCaptor<DeliveryPoll> poll = ArgumentCaptor.forClass(DeliveryPoll.class);
        verify(deliveryRunner).complete(eq(101L), poll.capture());
        assertThat(poll.getValue().status()).isEqualTo(DeliveryRunStatus.FAILED);
        verify(runRepository, never()).claim(anyLong(), anyString(), anyString(), any(), any(), any());
    }

    @Test
    @DisplayName("claim : course perdue (un autre runner a gagné) -> vide, sans erreur")
    void claim_lost_race() {
        DeliveryRun queued = run(102L, DeliveryRunStatus.QUEUED, null, owner, null);
        when(userRepository.findByEmail(OWNER_EMAIL)).thenReturn(Optional.of(owner));
        when(runRepository.findClaimable(anyString(), any(), anyLong(), any())).thenReturn(List.of(queued));
        when(visibilityGuard.canWrite(any(Project.class), eq(7L))).thenReturn(true);
        when(runRepository.claim(anyLong(), anyString(), anyString(), any(), any(), any())).thenReturn(0);

        assertThat(service.claim(RUNNER)).isEmpty();
    }

    @Test
    @DisplayName("claim : propriétaire inconnu ou désactivé -> refus")
    void claim_refused_for_unknown_or_inactive_owner() {
        when(userRepository.findByEmail(OWNER_EMAIL)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.claim(RUNNER)).isInstanceOf(ForbiddenException.class);

        User inactive = User.builder().id(7L).email(OWNER_EMAIL).isActive(false).build();
        when(userRepository.findByEmail(OWNER_EMAIL)).thenReturn(Optional.of(inactive));
        assertThatThrownBy(() -> service.claim(RUNNER)).isInstanceOf(ForbiddenException.class);
    }

    // ── session déléguée ─────────────────────────────────────────────────────

    @Test
    @DisplayName("openSession : run tenu par ce runner -> périmètre + délégant")
    void open_session_returns_scope_and_owner() {
        DeliveryRun held1 = run(100L, DeliveryRunStatus.RUNNING, "tf-runner-pierre", owner, LocalDateTime.now().minusMinutes(5));
        when(runRepository.findById(100L)).thenReturn(Optional.of(held1));

        DeliverySession session = service.openSession(100L, RUNNER);

        assertThat(session.workspaceSlug()).isEqualTo("acme");
        assertThat(session.projectId()).isEqualTo(12L);
        assertThat(session.ownerEmail()).isEqualTo(OWNER_EMAIL);
        assertThat(session.ownerKeycloakId()).isEqualTo("kc-7");
        assertThat(session.runnerClientId()).isEqualTo("tf-runner-pierre");
    }

    static Stream<Arguments> refusedSessions() {
        User someoneElse = User.builder().id(8L).email("mallory@taskforce.dev").isActive(true).build();
        User inactiveOwner = User.builder().id(7L).email(OWNER_EMAIL).isActive(false).build();
        LocalDateTime recent = LocalDateTime.now().minusMinutes(5);
        return Stream.of(
            Arguments.of("run encore en attente (jamais réclamé)", DeliveryRunStatus.QUEUED, null, "owner", null, "claude-code"),
            Arguments.of("run terminé", DeliveryRunStatus.DONE, "tf-runner-pierre", "owner", recent, "claude-code"),
            Arguments.of("run en échec", DeliveryRunStatus.FAILED, "tf-runner-pierre", "owner", recent, "claude-code"),
            Arguments.of("run tenu par un AUTRE runner", DeliveryRunStatus.RUNNING, "tf-runner-mallory", "owner", recent, "claude-code"),
            Arguments.of("run délégué par quelqu'un d'autre", DeliveryRunStatus.RUNNING, "tf-runner-pierre", someoneElse, recent, "claude-code"),
            Arguments.of("délégant supprimé", DeliveryRunStatus.RUNNING, "tf-runner-pierre", null, recent, "claude-code"),
            Arguments.of("délégant désactivé", DeliveryRunStatus.RUNNING, "tf-runner-pierre", inactiveOwner, recent, "claude-code"),
            Arguments.of("run d'un autre provider", DeliveryRunStatus.RUNNING, "tf-runner-pierre", "owner", recent, "cursor"),
            Arguments.of("session expirée (TTL dépassé)", DeliveryRunStatus.RUNNING, "tf-runner-pierre", "owner",
                LocalDateTime.now().minusMinutes(121), "claude-code"),
            Arguments.of("claim sans horodatage", DeliveryRunStatus.RUNNING, "tf-runner-pierre", "owner", null, "claude-code")
        );
    }

    @ParameterizedTest(name = "session refusée : {0}")
    @MethodSource("refusedSessions")
    void open_session_refused(String label, DeliveryRunStatus status, String claimedBy, Object startedBy,
                              LocalDateTime claimedAt, String providerKey) {
        User starter = "owner".equals(startedBy) ? owner : (User) startedBy;
        DeliveryRun run = run(100L, status, claimedBy, starter, claimedAt);
        run.setProviderKey(providerKey);
        when(runRepository.findById(100L)).thenReturn(Optional.of(run));

        assertThatThrownBy(() -> service.openSession(100L, RUNNER))
            .isInstanceOf(ForbiddenException.class)
            .hasMessage("Session de délégation invalide"); // même message quelle que soit la cause
    }

    @Test
    @DisplayName("openSession : run introuvable -> même refus (pas d'oracle sur l'existence)")
    void open_session_unknown_run() {
        when(runRepository.findById(404L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.openSession(404L, RUNNER))
            .isInstanceOf(ForbiddenException.class)
            .hasMessage("Session de délégation invalide");
    }

    // ── heartbeat / résultat ─────────────────────────────────────────────────

    @Test
    @DisplayName("heartbeat : refusé si le run n'appartient plus au runner")
    void heartbeat_refused_when_not_held() {
        when(runRepository.heartbeat(eq(100L), eq("tf-runner-pierre"), any(), eq(DeliveryRunStatus.RUNNING))).thenReturn(0);

        assertThatThrownBy(() -> service.heartbeat(100L, RUNNER)).isInstanceOf(ForbiddenException.class);
    }

    @Test
    @DisplayName("complete DONE : résumé + lien transmis au DeliveryRunner")
    void complete_done() {
        DeliveryRun held2 = run(100L, DeliveryRunStatus.RUNNING, "tf-runner-pierre", owner, LocalDateTime.now());
        when(runRepository.findByIdForUpdate(100L)).thenReturn(Optional.of(held2));

        service.complete(100L, RUNNER, new RunnerResultRequest("DONE", " PR opened ", "https://github.com/acme/website/pull/9", null));

        ArgumentCaptor<DeliveryPoll> poll = ArgumentCaptor.forClass(DeliveryPoll.class);
        verify(deliveryRunner).complete(eq(100L), poll.capture());
        assertThat(poll.getValue().status()).isEqualTo(DeliveryRunStatus.DONE);
        assertThat(poll.getValue().summary()).isEqualTo("PR opened");
        assertThat(poll.getValue().resultUrl()).isEqualTo("https://github.com/acme/website/pull/9");
    }

    @Test
    @DisplayName("complete FAILED : message par défaut si le runner n'en donne pas")
    void complete_failed_default_message() {
        DeliveryRun held3 = run(100L, DeliveryRunStatus.RUNNING, "tf-runner-pierre", owner, LocalDateTime.now());
        when(runRepository.findByIdForUpdate(100L)).thenReturn(Optional.of(held3));

        service.complete(100L, RUNNER, new RunnerResultRequest("FAILED", null, null, " "));

        ArgumentCaptor<DeliveryPoll> poll = ArgumentCaptor.forClass(DeliveryPoll.class);
        verify(deliveryRunner).complete(eq(100L), poll.capture());
        assertThat(poll.getValue().status()).isEqualTo(DeliveryRunStatus.FAILED);
        assertThat(poll.getValue().error()).isNotBlank();
    }

    @Test
    @DisplayName("complete : DONE sans résumé refusé ; run d'un autre runner refusé")
    void complete_refusals() {
        DeliveryRun held4 = run(100L, DeliveryRunStatus.RUNNING, "tf-runner-pierre", owner, LocalDateTime.now());
        when(runRepository.findByIdForUpdate(100L)).thenReturn(Optional.of(held4));
        assertThatThrownBy(() -> service.complete(100L, RUNNER, new RunnerResultRequest("DONE", " ", null, null)))
            .isInstanceOf(BusinessException.class);

        DeliveryRun held5 = run(200L, DeliveryRunStatus.RUNNING, "tf-runner-mallory", owner, LocalDateTime.now());
        when(runRepository.findByIdForUpdate(200L)).thenReturn(Optional.of(held5));
        assertThatThrownBy(() -> service.complete(200L, RUNNER, new RunnerResultRequest("DONE", "ok", null, null)))
            .isInstanceOf(ForbiddenException.class);

        verify(deliveryRunner, never()).complete(anyLong(), any());
    }
}
