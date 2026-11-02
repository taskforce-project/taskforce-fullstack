package com.taskforce.tf_api.core.service.ai;

import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import static org.assertj.core.api.Assertions.assertThat;

/** Les modèles retenus quand les réglages n'en nomment pas (repris de l'ancien relais de la coque, desktop/src/ai.ts). */
@DisplayName("ModelChoice")
class ModelChoiceTest {

    private static final List<String> OLLAMA = List.of("nomic-embed-text:latest", "llama3.1:8b", "bge-m3:latest", "qwen3:8b");

    private static AiProviderSettings settings(Map<String, String> env) {
        return AiProviderSettings.from(env::get);
    }

    @Test
    @DisplayName("AI_PROVIDER posé : complète les choix vides par ce qui est installé")
    void completesFromInstalledModels() {
        assertThat(ModelChoice.resolve(settings(Map.of("AI_PROVIDER", "ollama")), OLLAMA, OLLAMA))
            .isEqualTo(new ModelChoice.Models("qwen3:8b", "qwen3:8b", "bge-m3:latest"));
    }

    @Test
    @DisplayName("ancien format : les défauts de l'ai-service, sous leur nom (celui des vecteurs déjà calculés)")
    void legacyKeepsTheServiceDefaults() {
        assertThat(ModelChoice.resolve(settings(Map.of()), OLLAMA, OLLAMA))
            .isEqualTo(new ModelChoice.Models("qwen3:8b", "qwen3:8b", "bge-m3"));
    }

    @Test
    @DisplayName("garde les choix de la personne")
    void keepsTheChoices() {
        AiProviderSettings chosen = settings(Map.of("AI_MODEL", "llama3.1:8b", "AI_MODEL_FAST", "qwen3:8b", "AI_EMBED_MODEL", "x"));

        assertThat(ModelChoice.resolve(chosen, OLLAMA, OLLAMA)).isEqualTo(new ModelChoice.Models("llama3.1:8b", "qwen3:8b", "x"));
    }

    static Stream<Arguments> automatic() {
        return Stream.of(
            // Sur Ollama, tout modèle de conversation installé, jamais un modèle de vecteurs.
            Arguments.of(Map.of("AI_PROVIDER", "ollama"), List.of("bge-m3", "phi4:latest"), "phi4:latest", "phi4:latest"),
            // Une API compatible OpenAI qui ne sert qu'un modèle : celui-là.
            Arguments.of(Map.of("AI_PROVIDER", "openai", "AI_BASE_URL", "http://vllm:8000/v1"), List.of("my-model"), "my-model",
                "my-model"),
            // Une API aux nombreux modèles (voix, image...) : aucun choix au hasard.
            Arguments.of(Map.of("AI_PROVIDER", "openai"), List.of("gpt-x", "whisper-1", "tts-1"), null, null),
            // Groq garde ses modèles par défaut.
            Arguments.of(Map.of("GROQ_API_KEY", "gsk"), List.of("openai/gpt-oss-120b", "openai/gpt-oss-20b"),
                "openai/gpt-oss-120b", "openai/gpt-oss-20b"),
            // Anthropic : le premier modèle préféré annoncé, un Haiku pour les réponses rapides, versions datées comprises.
            Arguments.of(Map.of("AI_PROVIDER", "anthropic"),
                List.of("claude-haiku-4-5-20251001", "claude-sonnet-5-5", "claude-opus-5-5"), "claude-opus-5-5",
                "claude-haiku-4-5-20251001"),
            // Anthropic sans modèle préféré : le premier annoncé (le plus récent), lui aussi pour les réponses rapides.
            Arguments.of(Map.of("AI_PROVIDER", "anthropic"), List.of("claude-next-1", "claude-old-0"), "claude-next-1",
                "claude-next-1"),
            // Le fournisseur ne répond pas : rien à choisir.
            Arguments.of(Map.of("AI_PROVIDER", "ollama"), null, null, null));
    }

    @ParameterizedTest(name = "{0} sur {1}")
    @MethodSource("automatic")
    @DisplayName("choisit les modèles de conversation selon le fournisseur")
    void picksChatModels(Map<String, String> env, List<String> listed, String chat, String fast) {
        ModelChoice.Models models = ModelChoice.resolve(settings(env), listed, listed);

        assertThat(models.chat()).isEqualTo(chat);
        assertThat(models.fast()).isEqualTo(fast);
    }

    static Stream<Arguments> listed() {
        return Stream.of(
            Arguments.of(List.of("qwen3:8b"), "qwen3:8b", true),
            Arguments.of(List.of("bge-m3:latest"), "bge-m3", true),
            Arguments.of(List.of("claude-haiku-4-5-20251001"), "claude-haiku-4-5", true),
            Arguments.of(List.of("claude-opus-5-5"), "claude-opus-5", false),
            Arguments.of(List.of("qwen3:8b"), "missing:1b", false),
            Arguments.of(List.of(), "anything", true),
            Arguments.of(List.of("qwen3:8b"), null, false));
    }

    @ParameterizedTest(name = "{1} dans {0} : {2}")
    @MethodSource("listed")
    @DisplayName("un modèle nommé mais absent de la liste ne répondrait pas")
    void listed(List<String> models, String model, boolean expected) {
        assertThat(ModelChoice.listed(models, model)).isEqualTo(expected);
    }

    @Test
    @DisplayName("une préférence trouve le modèle sous son étiquette ou son espace de noms")
    void pickFindsTaggedModels() {
        assertThat(ModelChoice.pick(OLLAMA, List.of("bge-m3"))).isEqualTo("bge-m3:latest");
        assertThat(ModelChoice.pick(List.of("library/qwen3:8b", "qwen/qwen3-32b"), List.of("qwen3-32b"))).isEqualTo("qwen/qwen3-32b");
        assertThat(ModelChoice.pick(OLLAMA, List.of("mxbai-embed-large"))).isNull();
        assertThat(ModelChoice.pick(null, List.of("bge-m3"))).isNull();
    }
}
