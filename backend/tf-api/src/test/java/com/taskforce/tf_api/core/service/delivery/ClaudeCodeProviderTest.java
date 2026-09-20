package com.taskforce.tf_api.core.service.delivery;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

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

    private ClaudeCodeProvider provider(boolean enabled) {
        return new ClaudeCodeProvider(
            new LocalRunnerSettings(enabled, "delivery-runner", "tf-runner-", "tf_runner_owner", 120, 10), runRepository);
    }

    @Test
    @DisplayName("available suit delivery.local-runner.enabled ; toujours « pull »")
    void availability_follows_config() {
        assertThat(provider(false).available()).isFalse();
        assertThat(provider(true).available()).isTrue();
        assertThat(provider(true).pullBased()).isTrue();
        assertThat(provider(true).key()).isEqualTo("claude-code");
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
