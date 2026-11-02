package com.taskforce.tf_api.core.service.ai;

import java.time.Duration;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Les variables de l'ancien ai-service, lues par la passerelle de modèles : une instance en place garde son fichier
 * d'environnement tel quel (cas repris de ai-service/tests/test_config.py), et les nouveaux fournisseurs s'y ajoutent.
 */
@DisplayName("AiProviderSettings")
class AiProviderSettingsTest {

    private static final String HOST_OLLAMA = "http://host.docker.internal:11434/v1";

    private static AiProviderSettings settings(Map<String, String> env) {
        return AiProviderSettings.from(env::get);
    }

    static Stream<Arguments> providers() {
        return Stream.of(
            // Rien de posé : Ollama sur la machine hôte, les défauts de l'ai-service, vecteurs au même endroit.
            Arguments.of("rien de posé", Map.of(),
                AiProvider.OLLAMA, HOST_OLLAMA, "qwen3:8b", "", HOST_OLLAMA),
            Arguments.of("alias OLLAMA_*", Map.of("OLLAMA_BASE_URL", "http://gpu:11434/", "OLLAMA_MODEL", "qwen3:14b",
                    "OLLAMA_MODEL_FAST", "qwen3:8b"),
                AiProvider.OLLAMA, "http://gpu:11434/v1", "qwen3:14b", "qwen3:8b", "http://gpu:11434/v1"),
            Arguments.of("OLLAMA_BASE_URL qui porte déjà /v1", Map.of("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1"),
                AiProvider.OLLAMA, "http://127.0.0.1:11434/v1", "qwen3:8b", "", "http://127.0.0.1:11434/v1"),
            // Alias GROQ_* : le chat part chez Groq avec ses modèles, les vecteurs restent sur Ollama.
            Arguments.of("alias GROQ_*", Map.of("GROQ_API_KEY", "gsk"),
                AiProvider.OPENAI, "https://api.groq.com/openai/v1", "openai/gpt-oss-120b", "openai/gpt-oss-20b",
                HOST_OLLAMA),
            // Format générique de l'ai-service : toute API compatible OpenAI, vecteurs au même endroit.
            Arguments.of("AI_BASE_URL sans AI_PROVIDER", Map.of("AI_BASE_URL", "https://openrouter.ai/api/v1/",
                    "AI_MODEL", "m", "GROQ_API_KEY", "ignored"),
                AiProvider.OPENAI, "https://openrouter.ai/api/v1", "m", "", "https://openrouter.ai/api/v1"),
            Arguments.of("vecteurs ailleurs que le chat", Map.of("AI_BASE_URL", "https://api.groq.com/openai/v1",
                    "AI_EMBED_BASE_URL", "http://ollama:11434/v1"),
                AiProvider.OPENAI, "https://api.groq.com/openai/v1", "qwen3:8b", "", "http://ollama:11434/v1"),
            Arguments.of("openai sans adresse", Map.of("AI_PROVIDER", "openai"),
                AiProvider.OPENAI, "https://api.openai.com/v1", "", "", "https://api.openai.com/v1"),
            Arguments.of("custom, l'ancien nom de l'app desktop", Map.of("AI_PROVIDER", "custom", "AI_BASE_URL", "http://lm:1234/v1"),
                AiProvider.OPENAI, "http://lm:1234/v1", "", "", "http://lm:1234/v1"),
            // AI_PROVIDER posé : les modèles vides sont choisis parmi ceux du fournisseur (l'app desktop).
            // Ollama choisi avec son adresse : son réglage du raisonnement s'applique.
            Arguments.of("ollama avec AI_BASE_URL", Map.of("AI_PROVIDER", "ollama", "AI_BASE_URL", "http://gpu:11434/v1"),
                AiProvider.OLLAMA, "http://gpu:11434/v1", "", "", "http://gpu:11434/v1"),
            Arguments.of("groq choisi, sans clé GROQ_", Map.of("AI_PROVIDER", "groq", "AI_API_KEY", "k"),
                AiProvider.OPENAI, "https://api.groq.com/openai/v1", "openai/gpt-oss-120b", "openai/gpt-oss-20b",
                HOST_OLLAMA),
            // Anthropic n'a pas de vecteurs : Ollama, même avec une adresse d'API posée.
            Arguments.of("anthropic", Map.of("AI_PROVIDER", "Anthropic", "AI_API_KEY", "sk-ant"),
                AiProvider.ANTHROPIC, "https://api.anthropic.com/v1", "", "", HOST_OLLAMA),
            Arguments.of("anthropic par un relais", Map.of("AI_PROVIDER", "anthropic", "AI_BASE_URL", "https://relay.example/v1",
                    "OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
                AiProvider.ANTHROPIC, "https://relay.example/v1", "", "", "http://127.0.0.1:11434/v1"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("providers")
    @DisplayName("résout le fournisseur, l'adresse, les modèles et les vecteurs")
    void resolvesProviders(String name, Map<String, String> env, AiProvider provider, String base, String model,
                           String fast, String embedBase) {
        AiProviderSettings s = settings(env);

        assertThat(s.enabled()).isTrue();
        assertThat(s.provider()).isEqualTo(provider);
        assertThat(s.baseUrl()).isEqualTo(base);
        assertThat(s.model()).isEqualTo(model);
        assertThat(s.modelFast()).isEqualTo(fast);
        assertThat(s.embedBaseUrl()).isEqualTo(embedBase);
    }

    static Stream<Arguments> keys() {
        return Stream.of(
            Arguments.of(Map.of("GROQ_API_KEY", "gsk"), "gsk", ""),
            Arguments.of(Map.of("AI_BASE_URL", "https://x/v1", "AI_API_KEY", "k"), "k", "k"),
            Arguments.of(Map.of("AI_BASE_URL", "https://x/v1", "AI_API_KEY", "k", "AI_EMBED_BASE_URL", "https://y/v1"), "k", ""),
            Arguments.of(Map.of("AI_BASE_URL", "https://x/v1", "AI_API_KEY", "k", "AI_EMBED_API_KEY", "e"), "k", "e"),
            // La clé d'Anthropic ne part jamais vers Ollama.
            Arguments.of(Map.of("AI_PROVIDER", "anthropic", "AI_API_KEY", "sk-ant"), "sk-ant", ""));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("keys")
    @DisplayName("chaque fournisseur reçoit sa clé, et seulement la sienne")
    void keysPerProvider(Map<String, String> env, String chatKey, String embedKey) {
        AiProviderSettings s = settings(env);

        assertThat(s.apiKey()).isEqualTo(chatKey);
        assertThat(s.embedApiKey()).isEqualTo(embedKey);
    }

    static Stream<Arguments> limits() {
        return Stream.of(
            Arguments.of(Map.of(), true, Duration.ofSeconds(120), "bge-m3", 16_000),
            Arguments.of(Map.of("AI_PROVIDER", "none"), false, Duration.ofSeconds(120), "bge-m3", 16_000),
            Arguments.of(Map.of("AI_PROVIDER", "None", "OLLAMA_TIMEOUT", "300"), false, Duration.ofSeconds(300), "bge-m3", 16_000),
            Arguments.of(Map.of("AI_TIMEOUT", "60", "OLLAMA_EMBED_MODEL", "mxbai-embed-large", "AI_MAX_TOKENS", "4096"),
                true, Duration.ofSeconds(60), "mxbai-embed-large", 4096),
            Arguments.of(Map.of("AI_TIMEOUT", "1.5", "AI_MAX_TOKENS", "zero"), true, Duration.ofMillis(1500), "bge-m3", 16_000),
            // AI_PROVIDER posé : le modèle des vecteurs est choisi parmi les installés.
            Arguments.of(Map.of("AI_PROVIDER", "ollama"), true, Duration.ofSeconds(120), "", 16_000),
            Arguments.of(Map.of("AI_TIMEOUT", "-3", "AI_EMBED_MODEL", "bge-m3"), true, Duration.ofSeconds(120), "bge-m3", 16_000));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("limits")
    @DisplayName("coupure, délai, plafond de réponse et modèle des vecteurs")
    void limits(Map<String, String> env, boolean enabled, Duration timeout, String embedModel, int maxTokens) {
        AiProviderSettings s = settings(env);

        assertThat(s.enabled()).isEqualTo(enabled);
        assertThat(s.timeout()).isEqualTo(timeout);
        assertThat(s.embedModel()).isEqualTo(embedModel);
        assertThat(s.maxTokens()).isEqualTo(maxTokens);
    }

    @Test
    @DisplayName("les valeurs vides comptent comme absentes")
    void blankValuesAreUnset() {
        AiProviderSettings s = settings(Map.of("AI_BASE_URL", "  ", "GROQ_API_KEY", "", "OLLAMA_MODEL", ""));

        assertThat(s.provider()).isEqualTo(AiProvider.OLLAMA);
        assertThat(s.baseUrl()).isEqualTo(HOST_OLLAMA);
        assertThat(s.model()).isEqualTo("qwen3:8b");
    }

    @Test
    @DisplayName("ni le journal ni toString ne montrent une clé")
    void neverShowsAKey() {
        AiProviderSettings s = settings(Map.of("AI_PROVIDER", "anthropic", "AI_API_KEY", "sk-ant-secret",
            "AI_EMBED_BASE_URL", "https://user:pass@embed.example/v1", "AI_EMBED_API_KEY", "embed-secret"));

        assertThat(s.toString()).doesNotContain("sk-ant-secret", "embed-secret", "user:pass")
            .contains("ANTHROPIC", "api.anthropic.com", "key set", "embed.example");
        assertThat(settings(Map.of("AI_PROVIDER", "none")).describe()).contains("off");
    }

    @Test
    @DisplayName("mêmes adresse et clé : la sonde des vecteurs reprend celle du chat ; jamais chez Anthropic")
    void sameEmbedEndpoint() {
        assertThat(settings(Map.of()).sameEmbedEndpoint()).isTrue();
        assertThat(settings(Map.of("GROQ_API_KEY", "gsk")).sameEmbedEndpoint()).isFalse();
        assertThat(settings(Map.of("AI_PROVIDER", "anthropic", "AI_BASE_URL", HOST_OLLAMA)).sameEmbedEndpoint()).isFalse();
    }
}
