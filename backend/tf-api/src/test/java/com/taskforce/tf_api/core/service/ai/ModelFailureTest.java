package com.taskforce.tf_api.core.service.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.ConnectException;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpTimeoutException;
import java.time.Duration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

import com.taskforce.tf_api.core.service.ai.ModelProviderException.Why;

@DisplayName("ModelFailure : ce qui s'est passé quand un modèle n'a pas répondu, et quoi faire (TF-J1-15)")
class ModelFailureTest {

    /** Le fournisseur répond, et refuse : son statut et ses mots disent pourquoi. */
    @ParameterizedTest(name = "{0} « {1} » : {2}")
    @CsvSource(delimiter = '|', value = {
        "401 | {\"error\":\"invalid api key\"}                                | KEY_REFUSED",
        "403 | forbidden                                                       | KEY_REFUSED",
        "402 | payment required                                                | NO_CREDIT",
        "429 | {\"error\":{\"code\":\"insufficient_quota\"}}                   | NO_CREDIT",
        "400 | Your credit balance is too low                                  | NO_CREDIT",
        "429 | slow down                                                       | RATE_LIMITED",
        "404 | {\"error\":\"model 'x' not found\"}                            | MODEL_MISSING",
        "400 | model is not found here                                         | MODEL_MISSING",
        "413 | payload                                                         | TOO_LARGE",
        "400 | This model's maximum context length is 8192                     | TOO_LARGE",
        "500 | {\"error\":\"model requires more system memory (9 GiB)\"}      | OUT_OF_MEMORY",
        "500 | runner failed                                                   | PROVIDER_ERROR",
        "503 | overloaded                                                      | PROVIDER_ERROR",
        "400 | bad request                                                     | OTHER",
    })
    void a_refusal_says_why(int status, String body, Why why) {
        assertThat(ModelProviderException.refused(status, body).why()).isEqualTo(why);
    }

    @Test
    @DisplayName("une réponse qui n'est pas venue à temps n'est pas un fournisseur injoignable")
    void too_slow_is_not_unreachable() {
        Duration timeout = Duration.ofSeconds(180);

        ModelProviderException slow = ModelProviderException.transport("t", new HttpTimeoutException("timed out"), timeout);
        assertThat(slow.why()).isEqualTo(Why.TIMEOUT);
        assertThat(slow.waited()).isEqualTo(timeout);

        for (IOException nobody : new IOException[] {new HttpConnectTimeoutException("connect"), new ConnectException("refused"), new IOException("reset")}) {
            ModelProviderException unreachable = ModelProviderException.transport("t", nobody, timeout);
            assertThat(unreachable.why()).isEqualTo(Why.UNREACHABLE);
            assertThat(unreachable.waited()).isNull();
        }
    }

    @Test
    @DisplayName("la cause se retrouve sous ce qui l'enveloppe, avec le modèle et le temps qu'il a eu")
    void the_cause_is_found_under_its_wrappers() {
        ModelProviderException slow = ModelProviderException.transport("t", new HttpTimeoutException("timed out"), Duration.ofSeconds(90))
            .about("qwen3:8b");

        String said = ModelFailure.of(new RuntimeException("AI service unavailable", slow)).said();

        assertThat(said).startsWith("qwen3:8b took more than 90 seconds").contains("smaller model");
    }

    @Test
    @DisplayName("autre chose qu'une panne du fournisseur : une phrase qui ne prétend rien")
    void anything_else_stays_plain() {
        assertThat(ModelFailure.of(new IllegalStateException("boom")).why()).isEqualTo(Why.OTHER);
        assertThat(ModelFailure.of(new IllegalStateException("boom")).said()).startsWith("The model stopped before answering.");
    }

    /** La grammaire (R133) : chaque cause dit ce qui s'est passé et quoi faire, sans code d'erreur ni mot interne. */
    @ParameterizedTest
    @EnumSource(Why.class)
    void every_cause_says_what_to_do(Why why) {
        String said = new ModelFailure(why, "qwen3:8b", Duration.ofSeconds(120)).said();
        String unnamed = new ModelFailure(why, null, Duration.ofSeconds(120)).said();

        assertThat(said).matches("(?s).+[.].+[.]").doesNotContain("HTTP").doesNotMatch("(?s).*\\b[45]\\d\\d\\b.*");
        assertThat(unnamed).doesNotContain("null");
    }
}
