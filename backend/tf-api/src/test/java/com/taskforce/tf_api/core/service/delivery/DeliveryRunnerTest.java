package com.taskforce.tf_api.core.service.delivery;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

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
import static org.mockito.Mockito.mock;
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
    @DisplayName("run introuvable : no-op silencieux")
    void missing_run_is_noop() {
        when(runRepository.findById(99L)).thenReturn(Optional.empty());
        runner.execute(99L); // ne lève pas
        verify(runRepository).findById(99L);
    }
}
