package com.taskforce.tf_api.core.service.delivery;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.IssueStatus;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.repository.IssueRepository;
import com.taskforce.tf_api.core.repository.IssueStatusRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Prouve le pipeline de délégation (TF-AGENT-DELIVERY) avec le provider stub : {@code dispatch -> poll
 * -> résultat}, puis l'auto-move de l'issue (slice 4) vers « In review by AI » (DONE) / « Blocked »
 * (échec).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("DeliveryRunner")
class DeliveryRunnerTest {

    @Mock private DeliveryRunRepository runRepository;
    @Mock private DeliveryAgentProviderRegistry registry;
    @Mock private IssueStatusRepository issueStatusRepository;
    @Mock private IssueRepository issueRepository;

    @InjectMocks private DeliveryRunner runner;

    @Test
    @DisplayName("stub : run -> DONE (résumé + lien) et issue déplacée vers « In review by AI »")
    void stub_run_completes_and_moves_issue() {
        Project project = mock(Project.class);
        when(project.getId()).thenReturn(100L);
        when(project.getRepoFullName()).thenReturn(null);

        Issue issue = mock(Issue.class);
        when(issue.getId()).thenReturn(1L);
        when(issue.getTitle()).thenReturn("Faire la tâche");
        when(issue.getDescription()).thenReturn("Détails");
        when(issue.getProject()).thenReturn(project);

        DeliveryRun run = DeliveryRun.builder()
            .id(10L).issue(issue).providerKey("stub").status(DeliveryRunStatus.QUEUED).build();
        when(runRepository.findById(10L)).thenReturn(Optional.of(run));
        when(registry.get("stub")).thenReturn(new StubDeliveryProvider());
        // Colonne « In review by AI » absente -> créée
        when(issueStatusRepository.findByProjectIdAndName(100L, "In review by AI")).thenReturn(Optional.empty());
        when(issueStatusRepository.findByProjectIdOrderByPosition(100L)).thenReturn(List.of());
        when(issueStatusRepository.save(any(IssueStatus.class))).thenAnswer(inv -> inv.getArgument(0));

        runner.execute(10L);

        assertThat(run.getStatus()).isEqualTo(DeliveryRunStatus.DONE);
        assertThat(run.getSummary()).isNotBlank();
        assertThat(run.getResultUrl()).contains("stub-1-");
        verify(issue).setStatus(any(IssueStatus.class));       // issue déplacée
        verify(issueRepository).save(issue);
        verify(issueStatusRepository).save(any(IssueStatus.class)); // colonne créée
    }

    @Test
    @DisplayName("provider synchrone : immediateResult utilisé directement (poll jamais appelé)")
    void sync_provider_uses_immediate_result() {
        Project project = mock(Project.class);
        when(project.getId()).thenReturn(200L);

        Issue issue = mock(Issue.class);
        when(issue.getId()).thenReturn(2L);
        when(issue.getProject()).thenReturn(project);

        DeliveryRun run = DeliveryRun.builder()
            .id(20L).issue(issue).providerKey("sync").status(DeliveryRunStatus.QUEUED).build();
        when(runRepository.findById(20L)).thenReturn(Optional.of(run));

        DeliveryAgentProvider sync = mock(DeliveryAgentProvider.class);
        when(sync.dispatch(any())).thenReturn(new DeliveryDispatch(
            "ref-1", new DeliveryPoll(DeliveryRunStatus.DONE, "resume sync", "http://x", null)));
        when(registry.get("sync")).thenReturn(sync);
        when(issueStatusRepository.findByProjectIdAndName(200L, "In review by AI")).thenReturn(Optional.empty());
        when(issueStatusRepository.findByProjectIdOrderByPosition(200L)).thenReturn(List.of());
        when(issueStatusRepository.save(any(IssueStatus.class))).thenAnswer(inv -> inv.getArgument(0));

        runner.execute(20L);

        assertThat(run.getStatus()).isEqualTo(DeliveryRunStatus.DONE);
        assertThat(run.getSummary()).isEqualTo("resume sync");
        assertThat(run.getResultUrl()).isEqualTo("http://x");
        verify(sync, never()).poll(anyString(), any()); // résultat synchrone : pas de poll
    }

    @Test
    @DisplayName("provider inconnu : le run passe FAILED (move ignoré si pas de projet)")
    void unknown_provider_fails_run() {
        Issue issue = mock(Issue.class); // getProject() = null par défaut -> move sauté
        DeliveryRun run = DeliveryRun.builder()
            .id(11L).issue(issue).providerKey("nope").status(DeliveryRunStatus.QUEUED).build();
        when(runRepository.findById(11L)).thenReturn(Optional.of(run));
        when(registry.get("nope")).thenReturn(null);

        runner.execute(11L);

        assertThat(run.getStatus()).isEqualTo(DeliveryRunStatus.FAILED);
        assertThat(run.getError()).isNotBlank();
    }

    @Test
    @DisplayName("provider « pull » (runner local) : rien n'est dispatché ni écrit, le run reste QUEUED")
    void pull_based_provider_leaves_run_queued() {
        Issue issue = mock(Issue.class);
        DeliveryRun run = DeliveryRun.builder()
            .id(30L).issue(issue).providerKey("claude-code").status(DeliveryRunStatus.QUEUED).build();
        when(runRepository.findById(30L)).thenReturn(Optional.of(run));
        DeliveryAgentProvider pull = mock(DeliveryAgentProvider.class);
        when(pull.pullBased()).thenReturn(true);
        when(registry.get("claude-code")).thenReturn(pull);

        runner.execute(30L);

        assertThat(run.getStatus()).isEqualTo(DeliveryRunStatus.QUEUED);
        verify(pull, never()).dispatch(any());
        // Aucune sauvegarde : elle pourrait écraser un claim arrivé entre-temps.
        verify(runRepository, never()).save(any());
    }

    @Test
    @DisplayName("complete : résultat poussé par le runner -> DONE, issue déplacée ; ignoré si déjà terminé")
    void complete_applies_pushed_result_once() {
        Project project = mock(Project.class);
        when(project.getId()).thenReturn(300L);
        Issue issue = mock(Issue.class);
        when(issue.getProject()).thenReturn(project);
        DeliveryRun run = DeliveryRun.builder()
            .id(31L).issue(issue).providerKey("claude-code").status(DeliveryRunStatus.RUNNING).build();
        when(runRepository.findById(31L)).thenReturn(Optional.of(run));
        when(issueStatusRepository.findByProjectIdAndName(300L, "In review by AI")).thenReturn(Optional.empty());
        when(issueStatusRepository.findByProjectIdOrderByPosition(300L)).thenReturn(List.of());
        when(issueStatusRepository.save(any(IssueStatus.class))).thenAnswer(inv -> inv.getArgument(0));

        runner.complete(31L, new DeliveryPoll(DeliveryRunStatus.DONE, "PR opened", "https://github.com/o/r/pull/1", null));

        assertThat(run.getStatus()).isEqualTo(DeliveryRunStatus.DONE);
        assertThat(run.getSummary()).isEqualTo("PR opened");
        assertThat(run.getResultUrl()).isEqualTo("https://github.com/o/r/pull/1");
        verify(issueRepository).save(issue);

        // Second résultat sur un run terminé : ignoré (le premier fait foi).
        runner.complete(31L, new DeliveryPoll(DeliveryRunStatus.FAILED, null, null, "late failure"));
        assertThat(run.getStatus()).isEqualTo(DeliveryRunStatus.DONE);
        assertThat(run.getError()).isNull();
    }

    /** (libellé, provider « pull » ?, délai de réclamation en min, âge du run en min, lignes closes par l'UPDATE, clos ?) */
    static Stream<Arguments> unclaimedCases() {
        return Stream.of(
            Arguments.of("délai dépassé : clos, issue vers « Blocked »", true, 15, 16, 1, true),
            Arguments.of("délai non atteint : rien", true, 15, 5, 1, false),
            Arguments.of("réclamé au même instant : le runner gagne", true, 15, 16, 0, false),
            Arguments.of("provider « push » : jamais clos par ce chemin", false, null, 60, 1, false));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("unclaimedCases")
    @DisplayName("refresh d'un run en attente : une délégation que personne ne réclame est close")
    void refresh_expires_unclaimed_pull_runs(String label, boolean pull, Integer timeoutMinutes, int ageMinutes,
                                             int closedRows, boolean expectClosed) {
        Project project = mock(Project.class);
        lenient().when(project.getId()).thenReturn(400L);
        Issue issue = mock(Issue.class);
        lenient().when(issue.getProject()).thenReturn(project);
        DeliveryRun run = DeliveryRun.builder()
            .id(40L).issue(issue).providerKey("claude-code").status(DeliveryRunStatus.QUEUED).build();
        ReflectionTestUtils.setField(run, "createdAt", LocalDateTime.now().minusMinutes(ageMinutes));
        when(runRepository.findById(40L)).thenReturn(Optional.of(run));

        DeliveryAgentProvider provider = mock(DeliveryAgentProvider.class);
        when(provider.pullBased()).thenReturn(pull);
        lenient().when(provider.claimTimeout())
            .thenReturn(timeoutMinutes == null ? null : Duration.ofMinutes(timeoutMinutes));
        when(registry.get("claude-code")).thenReturn(provider);
        lenient().when(runRepository.expireUnclaimed(eq(40L), anyString(), any(),
            eq(DeliveryRunStatus.QUEUED), eq(DeliveryRunStatus.FAILED))).thenReturn(closedRows);
        lenient().when(issueStatusRepository.findByProjectIdAndName(400L, "Blocked")).thenReturn(Optional.empty());
        lenient().when(issueStatusRepository.findByProjectIdOrderByPosition(400L)).thenReturn(List.of());
        lenient().when(issueStatusRepository.save(any(IssueStatus.class))).thenAnswer(inv -> inv.getArgument(0));

        runner.refresh(40L);

        boolean attempted = pull && timeoutMinutes != null && ageMinutes > timeoutMinutes;
        verify(runRepository, times(attempted ? 1 : 0)).expireUnclaimed(eq(40L), anyString(), any(),
            eq(DeliveryRunStatus.QUEUED), eq(DeliveryRunStatus.FAILED));
        if (expectClosed) {
            verify(runRepository).expireUnclaimed(eq(40L), eq(DeliveryRunner.unclaimedMessage(Duration.ofMinutes(timeoutMinutes))),
                any(), eq(DeliveryRunStatus.QUEUED), eq(DeliveryRunStatus.FAILED));
            verify(issue).setStatus(any(IssueStatus.class)); // issue déplacée vers « Blocked »
            verify(issueRepository).save(issue);
        } else {
            verify(issueRepository, never()).save(any());
        }
        // Jamais d'écriture de la copie chargée : elle pourrait écraser un claim arrivé entre-temps.
        verify(runRepository, never()).save(any());
    }

    @Test
    @DisplayName("message d'une délégation non réclamée : délai, action, accès anticipé")
    void unclaimed_message_says_what_to_do() {
        assertThat(DeliveryRunner.unclaimedMessage(Duration.ofMinutes(15)))
            .contains("within 15 min")
            .contains("Start the TaskForce runner")
            .contains("early access");
    }

    @Test
    @DisplayName("run introuvable : no-op silencieux")
    void missing_run_is_noop() {
        when(runRepository.findById(99L)).thenReturn(Optional.empty());
        runner.execute(99L); // ne lève pas
        verify(runRepository).findById(99L);
    }
}
