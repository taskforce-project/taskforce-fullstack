package com.taskforce.tf_api.core.desktop;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import com.taskforce.tf_api.core.dto.response.DesktopAiStateResponse;
import com.taskforce.tf_api.core.service.AiStatusService;
import com.taskforce.tf_api.core.service.ai.AiProvider;
import com.taskforce.tf_api.core.service.ai.AiProviderConfig;
import com.taskforce.tf_api.core.service.ai.AiProviderSettings;
import com.taskforce.tf_api.core.service.ai.ModelGateway;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Le fournisseur d'IA de l'app desktop : la coque seule le lit et le change, et le changement vaut sans redémarrer.
 */
@DisplayName("DesktopAiService")
class DesktopAiServiceTest {

    private static final String SECRET = "tfsh_" + "s".repeat(43);

    private ModelGateway gateway;
    private AiProviderConfig config;
    private DesktopAiService service;

    @BeforeEach
    void setUp() {
        gateway = mock(ModelGateway.class);
        when(gateway.chatModels(any())).thenReturn(Optional.of(List.of("qwen3:8b", "bge-m3:latest")));
        when(gateway.embedModels(any())).thenReturn(Optional.of(List.of("bge-m3:latest")));
        config = new AiProviderConfig(AiProviderSettings.from(
            Map.of("AI_PROVIDER", "ollama", "OLLAMA_BASE_URL", "http://127.0.0.1:11434")::get));
        service = new DesktopAiService(config, new AiStatusService(gateway, config), SECRET);
    }

    @Test
    @DisplayName("l'état pour l'écran de réglages, sans adresse ni clé")
    void state() {
        DesktopAiStateResponse state = service.state(SECRET, true);

        assertThat(state.configured()).isTrue();
        assertThat(state.reachable()).isTrue();
        assertThat(state.models()).containsExactly("qwen3:8b", "bge-m3:latest");
        assertThat(state.chat()).isEqualTo(new DesktopAiStateResponse.Chat("qwen3:8b", "qwen3:8b", true));
        assertThat(state.embeddings()).isEqualTo(new DesktopAiStateResponse.Embeddings("bge-m3:latest", 1024, true));
    }

    @Test
    @DisplayName("un changement de fournisseur vaut tout de suite, clé comprise, sans rien garder du précédent")
    void appliesRightAway() {
        when(gateway.chatModels(any())).thenReturn(Optional.of(List.of("claude-opus-5-5", "claude-haiku-5-5")));

        DesktopAiStateResponse state = service.apply(SECRET, Map.of("AI_PROVIDER", "anthropic", "AI_API_KEY", "sk-ant-1",
            "OLLAMA_BASE_URL", "http://127.0.0.1:11434"));

        AiProviderSettings now = config.current();
        assertThat(now.provider()).isEqualTo(AiProvider.ANTHROPIC);
        assertThat(now.apiKey()).isEqualTo("sk-ant-1");
        assertThat(now.embedBaseUrl()).isEqualTo("http://127.0.0.1:11434/v1");
        assertThat(state.chat()).isEqualTo(new DesktopAiStateResponse.Chat("claude-opus-5-5", "claude-haiku-5-5", true));
        assertThat(state.embedModels()).containsExactly("bge-m3:latest");

        service.apply(SECRET, Map.of("AI_PROVIDER", "ollama"));
        assertThat(config.current().apiKey()).isEmpty();
        assertThat(config.current().baseUrl()).isEqualTo("http://host.docker.internal:11434/v1");
    }

    @ParameterizedTest(name = "secret « {0} »")
    @NullAndEmptySource
    @ValueSource(strings = {"tfsh_wrong", "tfd_launch-token-of-the-window"})
    @DisplayName("sans le secret de la coque : refusé, et rien ne change")
    void refusesWithoutTheShellSecret(String given) {
        assertThatThrownBy(() -> service.apply(given, Map.of("AI_PROVIDER", "none"))).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> service.state(given, false)).isInstanceOf(ForbiddenException.class);
        assertThat(config.current().enabled()).isTrue();
    }

    @Test
    @DisplayName("sans secret posé au lancement, personne n'y a droit")
    void closedWithoutConfiguredSecret() {
        DesktopAiService closed = new DesktopAiService(config, new AiStatusService(gateway, config), "");

        assertThatThrownBy(() -> closed.state("", false)).isInstanceOf(ForbiddenException.class);
    }

    @Test
    @DisplayName("seules les variables que la passerelle lit sont admises")
    void refusesUnknownVariables() {
        assertThatThrownBy(() -> service.apply(SECRET, Map.of("SPRING_DATASOURCE_URL", "jdbc:postgresql://elsewhere/db")))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("SPRING_DATASOURCE_URL");
        assertThat(config.current().provider()).isEqualTo(AiProvider.OLLAMA);
    }
}
