package com.taskforce.tf_api.core.service.delivery;

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
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Prouve le pipeline de délégation (TF-AGENT-DELIVERY slice 3) avec le provider stub :
 * {@code dispatch -> poll -> résultat}. Le run passe QUEUED -> DONE avec un résumé + un lien.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("DeliveryRunner")
class DeliveryRunnerTest {

    @Mock private DeliveryRunRepository runRepository;
    @Mock private DeliveryAgentProviderRegistry registry;

    @InjectMocks private DeliveryRunner runner;

    @Test
    @DisplayName("stub : le run va jusqu'a DONE avec résumé + lien")
    void stub_run_completes() {
        Issue issue = mock(Issue.class);
        when(issue.getId()).thenReturn(1L);
        when(issue.getTitle()).thenReturn("Faire la tâche");
        when(issue.getDescription()).thenReturn("Détails");
        when(issue.getProject()).thenReturn(null);

        DeliveryRun run = DeliveryRun.builder()
            .id(10L).issue(issue).providerKey("stub").status(DeliveryRunStatus.QUEUED).build();
        when(runRepository.findById(10L)).thenReturn(Optional.of(run));
        when(registry.get("stub")).thenReturn(new StubDeliveryProvider());

        runner.execute(10L);

        assertThat(run.getStatus()).isEqualTo(DeliveryRunStatus.DONE);
        assertThat(run.getExternalRef()).isNotBlank();
        assertThat(run.getSummary()).isNotBlank();
        assertThat(run.getResultUrl()).contains("stub-1-");
        verify(runRepository, org.mockito.Mockito.atLeastOnce()).save(run);
    }

    @Test
    @DisplayName("provider inconnu : le run passe FAILED")
    void unknown_provider_fails_run() {
        Issue issue = mock(Issue.class);
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
