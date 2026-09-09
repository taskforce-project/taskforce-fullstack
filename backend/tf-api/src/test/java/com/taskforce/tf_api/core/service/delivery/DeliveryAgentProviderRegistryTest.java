package com.taskforce.tf_api.core.service.delivery;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests unitaires de {@link DeliveryAgentProviderRegistry} (TF-AGENT-DELIVERY slice 2) :
 * indexation par clé, ordre d'enregistrement, résolution.
 */
@DisplayName("DeliveryAgentProviderRegistry")
class DeliveryAgentProviderRegistryTest {

    @Test
    void indexes_all_providers_and_resolves_by_key() {
        var reg = new DeliveryAgentProviderRegistry(
            List.of(new ClaudeCodeProvider(), new CopilotProvider(), new CursorProvider()));

        assertThat(reg.all()).hasSize(3);
        assertThat(reg.all().get(0).key()).isEqualTo("claude-code"); // ordre conservé
        assertThat(reg.get("github-copilot").displayName()).isEqualTo("GitHub Copilot");
        assertThat(reg.get("claude-code").available()).isFalse();     // slice 2 : pas encore exécutable
        assertThat(reg.get("cursor").logoKey()).isEqualTo("cursor");
        assertThat(reg.get("inconnu")).isNull();
        assertThat(reg.get(null)).isNull();
    }
}
