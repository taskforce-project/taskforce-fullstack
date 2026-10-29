package com.taskforce.tf_api.core.service.delivery;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.ObjectProvider;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;
import com.taskforce.tf_api.core.repository.DeliveryRunRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Provider « pull » du runner local (ADR-013) : disponibilité pilotée par la config, et détection d'un
 * runner perdu (sinon un run resterait « en cours » pour toujours).
 */
@DisplayName("ClaudeCodeProvider")
class ClaudeCodeProviderTest {

    private final DeliveryRunRepository runRepository = mock(DeliveryRunRepository.class);
    private final RunnerProvisioningService provisioning = mock(RunnerProvisioningService.class);
    private final RunnerPresenceService presence = new RunnerPresenceService();

    @SuppressWarnings("unchecked")
    private ClaudeCodeProvider provider(boolean enabled, RunnerProvisioningService service) {
        ObjectProvider<RunnerProvisioningService> beans = mock(ObjectProvider.class);
        when(beans.getIfAvailable()).thenReturn(service);
        return new ClaudeCodeProvider(
            new LocalRunnerSettings(enabled, "delivery-runner", "tf-runner-", "tf_runner_owner", 120, 10, 15), runRepository, beans,
            presence);
    }

    private ClaudeCodeProvider provider(boolean enabled) {
        return provider(enabled, provisioning);
    }

    @Test
    @DisplayName("prêt seulement pour une personne qui a créé son runner (OSS-5.7)")
    void ready_only_with_a_runner() {
        DeliveryContext ada = new DeliveryContext(7L, null, null);
        when(provisioning.hasRunner(7L)).thenReturn(false, true);

        assertThat(provider(true).unavailableReason(ada)).contains("Set up your local runner first");
        assertThat(provider(true).unavailableReason(ada)).isNull();
        assertThat(provider(false).unavailableReason(ada)).contains("isn't enabled on this instance");
    }

    @ParameterizedTest(name = "« {0} » : {1}")
    @CsvSource(delimiter = '|', value = {
        "claude-signed-out | isn't signed in on the computer that runs your runner",
        "claude-outdated   | is too old on the computer that runs your runner",
        "claude-missing    | isn't installed on the computer that runs your runner",
        "something-new     | open Settings > Agents to see what is missing",
    })
    @DisplayName("le runner signale un problème sur son poste : l'agent n'est plus proposé, avec la cause (R37)")
    void runner_problem_makes_it_unavailable(String problem, String reason) {
        when(provisioning.hasRunner(7L)).thenReturn(true);
        presence.report(7L, "tf-runner-pierre", problem);

        assertThat(provider(true).unavailableReason(new DeliveryContext(7L, null, null))).contains(reason);

        presence.report(7L, "tf-runner-pierre", null);
        assertThat(provider(true).unavailableReason(new DeliveryContext(7L, null, null))).isNull();
    }

    @Test
    @DisplayName("sans service de provisionnement (runner coupé au démarrage) : pas de vérification de plus")
    void ready_without_provisioning_bean() {
        assertThat(provider(true, null).unavailableReason(new DeliveryContext(7L, null, null))).isNull();
    }

    @Test
    @DisplayName("available suit delivery.local-runner.enabled ; toujours « pull »")
    void availability_follows_config() {
        assertThat(provider(false).available()).isFalse();
        assertThat(provider(true).available()).isTrue();
        assertThat(provider(true).pullBased()).isTrue();
        assertThat(provider(true).key()).isEqualTo("claude-code");
        // Délai de réclamation lu dans la config : au-delà, DeliveryRunner clôt un run que personne ne prend.
        assertThat(provider(true).claimTimeout()).isEqualTo(Duration.ofMinutes(15));
    }

    @ParameterizedTest(name = "dernier signe de vie il y a {0} min -> {1}")
    @CsvSource({
        "0,  RUNNING",
        "9,  RUNNING",
        "11, FAILED",
        "90, FAILED",
    })
    void poll_detects_lost_runner(long minutesSilent, DeliveryRunStatus expected) {
        DeliveryRun run = DeliveryRun.builder().id(1L).providerKey("claude-code").status(DeliveryRunStatus.RUNNING)
            .heartbeatAt(LocalDateTime.now().minusMinutes(minutesSilent)).build();
        when(runRepository.findByExternalRef("runner:x")).thenReturn(Optional.of(run));

        DeliveryPoll poll = provider(true).poll("runner:x", 26L);

        assertThat(poll.status()).isEqualTo(expected);
        if (expected == DeliveryRunStatus.FAILED) {
            assertThat(poll.error()).contains("Runner lost");
        }
    }

    @Test
    @DisplayName("poll : handle inconnu -> RUNNING (jamais d'échec inventé)")
    void poll_unknown_ref_keeps_running() {
        when(runRepository.findByExternalRef("nope")).thenReturn(Optional.empty());

        assertThat(provider(true).poll("nope", 26L).status()).isEqualTo(DeliveryRunStatus.RUNNING);
    }
}
