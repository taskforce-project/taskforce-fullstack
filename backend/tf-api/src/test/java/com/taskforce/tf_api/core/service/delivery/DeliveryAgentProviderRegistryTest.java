package com.taskforce.tf_api.core.service.delivery;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.taskforce.tf_api.core.repository.IntegrationRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Tests unitaires de {@link DeliveryAgentProviderRegistry} (TF-AGENT-DELIVERY) :
 * indexation par clé, ordre d'enregistrement, résolution.
 */
@DisplayName("DeliveryAgentProviderRegistry")
class DeliveryAgentProviderRegistryTest {

    @Test
    void indexes_all_providers_and_resolves_by_key() {
        IntegrationRepository integrations = mock(IntegrationRepository.class);
        var reg = new DeliveryAgentProviderRegistry(List.of(
            new ClaudeCodeProvider(), new CopilotProvider(integrations), new CursorProvider(integrations)));

        assertThat(reg.all()).hasSize(3);
        assertThat(reg.all().get(0).key()).isEqualTo("claude-code"); // ordre conservé
        assertThat(reg.get("github-copilot").displayName()).isEqualTo("GitHub Copilot");
        assertThat(reg.get("github-copilot").available()).isTrue();   // Copilot exécutable (inférence GitHub)
        assertThat(reg.get("claude-code").available()).isFalse();     // "à venir" (coding agent Managed Agents)
        assertThat(reg.get("cursor").available()).isTrue();           // Cursor exécutable (background agent)
        assertThat(reg.get("cursor").logoKey()).isEqualTo("cursor");
        assertThat(reg.get("inconnu")).isNull();
        assertThat(reg.get(null)).isNull();
    }
}
