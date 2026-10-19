package com.taskforce.tf_api.core.service.delivery;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import com.taskforce.tf_api.core.repository.DeliveryRunRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires de {@link DeliveryAgentProviderRegistry} (TF-AGENT-DELIVERY) :
 * indexation par clé, ordre d'enregistrement, résolution.
 */
@DisplayName("DeliveryAgentProviderRegistry")
class DeliveryAgentProviderRegistryTest {

    @Test
    @SuppressWarnings("unchecked")
    void indexes_all_providers_and_resolves_by_key() {
        // Runner local désactivé (défaut) : Claude Code reste « à venir ».
        LocalRunnerSettings runnerOff = new LocalRunnerSettings(false, "delivery-runner", "tf-runner-", "tf_runner_owner", 120, 10, 15);
        DeliveryAgentProvider other = mock(DeliveryAgentProvider.class);
        when(other.key()).thenReturn("other-agent");
        var reg = new DeliveryAgentProviderRegistry(List.of(
            new ClaudeCodeProvider(runnerOff, mock(DeliveryRunRepository.class), mock(ObjectProvider.class)), other));

        assertThat(reg.all()).hasSize(2);
        assertThat(reg.all().get(0).key()).isEqualTo("claude-code"); // ordre conservé
        assertThat(reg.get("other-agent")).isSameAs(other);
        assertThat(reg.get("claude-code").displayName()).isEqualTo("Claude Code");
        assertThat(reg.get("claude-code").available()).isFalse();     // "à venir" tant que le runner local est désactivé
        assertThat(reg.get("claude-code").pullBased()).isTrue();      // provider « pull » (ADR-013)
        assertThat(reg.get("inconnu")).isNull();
        assertThat(reg.get(null)).isNull();
    }
}
