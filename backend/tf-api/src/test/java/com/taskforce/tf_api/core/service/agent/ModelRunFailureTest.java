package com.taskforce.tf_api.core.service.agent;

import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import com.taskforce.tf_api.core.service.AiGatewayClient;
import com.taskforce.tf_api.core.service.ai.ModelProviderException;
import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link ModelRunFailure} : une mesure sans réponse à noter dit d'abord pourquoi, en mots, puis quoi faire ; l'essai à l'aveugle
 * ne nomme jamais son modèle.
 */
@DisplayName("ModelRunFailure")
class ModelRunFailureTest {

    private static final String MIMO = "mimo-v2.6:9b";
    private static final String THEN = "Run it again, or leave it out of the run.";

    /** Les causes telles que la passerelle les sait, avec les mots d'Ollama quand il refuse. */
    static Stream<Arguments> causes() {
        return Stream.of(
            Arguments.of(ModelProviderException.notServed(MIMO), "The AI of this instance doesn't serve mimo-v2.6:9b any more."),
            Arguments.of(ModelProviderException.refused(404, "{\"error\":\"model 'mimo-v2.6:9b' not found\"}"),
                "The AI of this instance doesn't serve mimo-v2.6:9b any more."),
            Arguments.of(new ModelProviderException.Unreachable("AI provider unreachable", null),
                "The AI doesn't answer. Check that it is running."),
            Arguments.of(ModelProviderException.refused(500,
                    "{\"error\":\"model requires more system memory (7.2 GiB) than is available (1.8 GiB)\"}"),
                "mimo-v2.6:9b doesn't fit in this machine's memory right now."),
            Arguments.of(ModelProviderException.tooLarge("AI provider: the request is too large (HTTP 413)"),
                "This request is too large for mimo-v2.6:9b."),
            Arguments.of(ModelProviderException.refused(429, "{}"), "The AI provider is limiting requests right now."),
            Arguments.of(ModelProviderException.refused(402, "{}"), "The AI provider has no credit left on this account."),
            Arguments.of(ModelProviderException.refused(401, "{}"), "The AI provider refused the API key. Check it in the AI settings."),
            Arguments.of(ModelProviderException.refused(500, "{\"error\":\"llama runner process has terminated\"}"),
                "The AI had an error while mimo-v2.6:9b was answering."),
            // Rien de plus précis n'est connu : la phrase d'avant, le détail reste au journal.
            Arguments.of(new ModelProviderException("AI provider sent an invalid answer"), "mimo-v2.6:9b stopped answering on this machine."),
            Arguments.of(null, "mimo-v2.6:9b stopped answering on this machine."));
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource("causes")
    @DisplayName("la cause d'abord, en mots, puis quoi faire ; le code reste celui que l'écran lit")
    void saysTheCause(ModelProviderException cause, String said) {
        BusinessException failure = ModelRunFailure.of(MIMO, new AiGatewayClient.LlmException("AI service unavailable", cause), THEN);

        assertThat(failure.getErrorCode()).isEqualTo("MODEL_FAILED");
        assertThat(failure.getMessage()).isEqualTo(said + " " + THEN);
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource("causes")
    @DisplayName("l'essai à l'aveugle ne nomme pas son modèle, même quand la passerelle le sait")
    void theBlindTrialNamesNoModel(ModelProviderException cause, String said) {
        BusinessException failure = ModelRunFailure.of(null, new AiGatewayClient.LlmException("AI service unavailable", cause),
            "Try again, or try another model.");

        assertThat(failure.getMessage()).doesNotContain("mimo").endsWith(". Try again, or try another model.");
    }
}
