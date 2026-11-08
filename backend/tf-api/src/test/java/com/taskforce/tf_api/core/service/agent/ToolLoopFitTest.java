package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.service.ai.ContextBudget;
import com.taskforce.tf_api.core.service.ai.ModelWindow;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La boucle d'outils reste dans la fenêtre (TF-J1-13) : les résultats déjà lus se raccourcissent d'abord, ce que le modèle
 * vient de lire reste entier tant que c'est possible, et rien n'est coupé sans que le modèle le lise.
 */
@DisplayName("ToolLoopFit")
class ToolLoopFitTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    /** 8 192 jetons, 2 048 pour la réponse, 112 pour les outils : 6 000 pour les messages. */
    private static final ContextBudget BUDGET =
        new ContextBudget(new ModelWindow("qwen3:8b", 8_192, false, 2_048), 500, 112, 0, 100);

    private static Map<String, Object> message(String role, String content) {
        return Map.of("role", role, "content", content);
    }

    private static Map<String, Object> calls() {
        return Map.of("role", "assistant", "content", "", "tool_calls", List.of(Map.of("id", "c1")));
    }

    private static Map<String, Object> result(String content) {
        return Map.of("role", "tool", "tool_call_id", "c1", "content", content);
    }

    private static String content(Map<String, Object> message) {
        return String.valueOf(message.get("content"));
    }

    private static int size(List<Map<String, Object>> messages) {
        return messages.stream().mapToInt(message -> ContextBudget.tokensOf(JSON, message)).sum();
    }

    /** Les consignes, {@code history} messages d'historique, la demande, puis la boucle. */
    private static List<Map<String, Object>> conversation(List<Map<String, Object>> history, List<Map<String, Object>> loop) {
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(message("system", "You are Cortex."));
        messages.addAll(history);
        messages.add(message("user", "What changed?"));
        messages.addAll(loop);
        return messages;
    }

    private static ToolLoopFit fit(int history) {
        return new ToolLoopFit(JSON, BUDGET, history);
    }

    @Test
    @DisplayName("quand tout tient, rien ne change")
    void nothingChangesWhenItFits() {
        List<Map<String, Object>> messages = conversation(List.of(), List.of(calls(), result("short")));
        List<Map<String, Object>> before = new ArrayList<>(messages);
        ToolLoopFit fit = fit(0);

        assertThat(fit.apply(messages)).isTrue();

        assertThat(messages).isEqualTo(before);
        assertThat(fit.shortened()).isZero();
        assertThat(fit.leftOut()).isZero();
    }

    @Test
    @DisplayName("un résultat déjà lu se raccourcit, ce que le modèle vient de lire reste entier")
    void theOldestResultsShortenFirst() {
        String old = "o".repeat(15_000);
        String latest = "l".repeat(6_000);
        List<Map<String, Object>> messages = conversation(List.of(), List.of(calls(), result(old), calls(), result(latest)));
        ToolLoopFit fit = fit(0);

        assertThat(fit.apply(messages)).isTrue();

        assertThat(content(messages.get(3))).startsWith("oooo").hasSize(ToolLoopFit.KEPT_CHARS + ToolLoopFit.SHORTENED.length())
            .endsWith(ToolLoopFit.SHORTENED);
        assertThat(content(messages.get(5))).isEqualTo(latest);
        assertThat(fit.shortened()).isEqualTo(1);
        assertThat(size(messages)).isLessThanOrEqualTo(6_000);
    }

    @ParameterizedTest(name = "{0} caractères d''un coup, sur {1} outils")
    @CsvSource({"24000, 1", "60000, 1", "60000, 3", "300000, 2"})
    @DisplayName("ce qui vient d'arriver, trop long pour la fenêtre, garde son début, et la requête tient")
    void aLongResultIsCapped(int chars, int tools) {
        List<Map<String, Object>> loop = new ArrayList<>();
        loop.add(calls());
        for (int i = 0; i < tools; i++) {
            loop.add(result("r".repeat(chars)));
        }
        List<Map<String, Object>> messages = conversation(List.of(), loop);
        ToolLoopFit fit = fit(0);

        assertThat(fit.apply(messages)).isTrue();

        assertThat(size(messages)).isLessThanOrEqualTo(6_000);
        assertThat(content(messages.get(3))).startsWith("rrrr").endsWith(ToolLoopFit.SHORTENED);
        assertThat(fit.shortened()).isEqualTo(tools);
    }

    @Test
    @DisplayName("des caractères échappés pèsent plus que leur texte : un second passage les fait tenir")
    void escapedCharactersWeighMore() {
        List<Map<String, Object>> messages = conversation(List.of(), List.of(calls(), result("\"".repeat(24_000))));

        assertThat(fit(0).apply(messages)).isTrue();

        assertThat(size(messages)).isLessThanOrEqualTo(6_000);
    }

    @Test
    @DisplayName("en dernier recours, l'historique le plus ancien ne part pas, jamais le résumé ni la demande")
    void theOldestHistoryGoesLast() {
        Map<String, Object> summary = message("system", "Summary of the earlier exchanges of this conversation: Zephyr-7.");
        List<Map<String, Object>> messages = conversation(List.of(summary, message("user", "a".repeat(9_000)),
            message("assistant", "b".repeat(9_000))), List.of());
        ToolLoopFit fit = fit(3);

        assertThat(fit.apply(messages)).isTrue();

        assertThat(messages).extracting(ToolLoopFitTest::content)
            .containsExactly("You are Cortex.", content(summary), "b".repeat(9_000), "What changed?");
        assertThat(fit.leftOut()).isEqualTo(1);
    }

    @Test
    @DisplayName("les consignes et la demande ne se coupent pas : si elles seules dépassent, la boucle s'arrête")
    void whatCannotShrinkEndsTheLoop() {
        List<Map<String, Object>> messages = new ArrayList<>(List.of(message("system", "s".repeat(20_000)), message("user", "x")));

        assertThat(fit(0).apply(messages)).isFalse();
    }

    @Test
    @DisplayName("un résultat déjà court n'est pas raccourci deux fois")
    void aShortResultStaysAsItIs() {
        String old = "o".repeat(300);
        List<Map<String, Object>> messages = conversation(List.of(message("user", "a".repeat(18_000))),
            List.of(calls(), result(old), calls(), result("l".repeat(250))));
        ToolLoopFit fit = fit(1);

        assertThat(fit.apply(messages)).isTrue();

        assertThat(fit.shortened()).isZero();
        assertThat(fit.leftOut()).isEqualTo(1);
    }

    @Test
    @DisplayName("sans appel d'outil, rien à partager : seul l'historique peut céder")
    void noToolCallNothingToShare() {
        List<Map<String, Object>> messages = conversation(List.of(message("user", "a".repeat(18_000))), List.of());
        ToolLoopFit fit = fit(1);

        assertThat(fit.apply(messages)).isTrue();

        assertThat(fit.leftOut()).isEqualTo(1);
    }
}
