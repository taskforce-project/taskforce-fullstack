package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.taskforce.tf_api.core.service.AiStatusService.AiStatus;
import com.taskforce.tf_api.core.service.ai.AiProviderConfig;
import com.taskforce.tf_api.core.service.ai.AiProviderSettings;
import com.taskforce.tf_api.core.service.ai.ModelGateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** État de l'IA lu chez le fournisseur par la passerelle, gardé en cache, et repli quand il ne répond pas. */
@DisplayName("AiStatusService")
class AiStatusServiceTest {

    private static final List<String> INSTALLED = List.of("qwen3:8b", "bge-m3:latest");

    private ModelGateway gateway;
    private AiProviderConfig config;
    private AiStatusService service;

    @BeforeEach
    void setUp() {
        gateway = mock(ModelGateway.class);
        config = new AiProviderConfig(AiProviderSettings.from(Map.<String, String>of()::get));
        service = new AiStatusService(gateway, config);
    }

    @Test
    @DisplayName("lit les modèles d'Ollama une fois (même point d'accès pour les vecteurs) et garde l'état en cache")
    void readsAndCaches() {
        when(gateway.chatModels(any())).thenReturn(Optional.of(INSTALLED));

        AiStatus first = service.current();
        AiStatus second = service.current();

        assertThat(first).isEqualTo(new AiStatus(true, true, "qwen3:8b", "qwen3:8b", true, "bge-m3"));
        assertThat(second).isSameAs(first);
        verify(gateway, times(1)).chatModels(any());
        verify(gateway, never()).embedModels(any());
    }

    @Test
    @DisplayName("invalidate, ou un changement de réglages : le prochain appel relit le fournisseur")
    void invalidateAndNewSettingsRefetch() {
        when(gateway.chatModels(any())).thenReturn(Optional.of(INSTALLED));

        service.current();
        service.invalidate();
        service.current();
        config.replace(Map.of("AI_PROVIDER", "ollama", "AI_MODEL", "qwen3:8b"));
        service.current();

        verify(gateway, times(3)).chatModels(any());
    }

    @Test
    @DisplayName("fournisseur injoignable : IA configurée mais indisponible, sans exception, modèles nommés comme avant")
    void unreachable() {
        when(gateway.chatModels(any())).thenReturn(Optional.empty());

        AiStatusService.Snapshot snapshot = service.snapshot();

        assertThat(snapshot.status()).isEqualTo(new AiStatus(true, false, "qwen3:8b", "qwen3:8b", false, "bge-m3"));
        assertThat(snapshot.reachable()).isFalse();
        assertThat(snapshot.models()).isEmpty();
    }

    @Test
    @DisplayName("un modèle nommé mais absent ne répondrait pas : indisponible, avec son nom")
    void missingModel() {
        config.replace(Map.of("AI_MODEL", "missing:1b"));
        when(gateway.chatModels(any())).thenReturn(Optional.of(INSTALLED));

        AiStatus status = service.current();

        assertThat(status.chatAvailable()).isFalse();
        assertThat(status.chatModel()).isEqualTo("missing:1b");
        assertThat(status.embeddingsAvailable()).isTrue();
    }

    @Test
    @DisplayName("Anthropic : la conversation chez Anthropic, les vecteurs sur Ollama, chacun sa liste")
    void anthropicWithOllamaEmbeddings() {
        config.replace(Map.of("AI_PROVIDER", "anthropic", "AI_API_KEY", "sk-ant"));
        when(gateway.chatModels(any())).thenReturn(Optional.of(List.of("claude-opus-5-5", "claude-haiku-5-5")));
        when(gateway.embedModels(any())).thenReturn(Optional.of(List.of("bge-m3:latest")));

        AiStatusService.Snapshot snapshot = service.snapshot();

        assertThat(snapshot.status()).isEqualTo(
            new AiStatus(true, true, "claude-opus-5-5", "claude-haiku-5-5", true, "bge-m3:latest"));
        assertThat(snapshot.models()).containsExactly("claude-opus-5-5", "claude-haiku-5-5");
        assertThat(snapshot.embedModels()).containsExactly("bge-m3:latest");
        assertThat(snapshot.settings().apiKey()).isEqualTo("sk-ant");
    }

    @Test
    @DisplayName("IA coupée : aucun appel au fournisseur")
    void off() {
        config.replace(Map.of("AI_PROVIDER", "none"));

        assertThat(service.current()).isEqualTo(new AiStatus(false, false, null, null, false, null));
        verify(gateway, never()).chatModels(any());
    }
}
