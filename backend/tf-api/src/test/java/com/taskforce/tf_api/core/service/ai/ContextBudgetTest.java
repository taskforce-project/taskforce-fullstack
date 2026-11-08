package com.taskforce.tf_api.core.service.ai;

import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;

import com.fasterxml.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Le budget d'une requête (TF-J1-13) : les consignes, les outils, ce qui est joint et la demande contre la fenêtre moins la
 * place de la réponse ; un petit modèle garde peu d'historique, un grand beaucoup.
 */
@DisplayName("ContextBudget")
class ContextBudgetTest {

    private static final int UNKNOWN = -1;

    /** Une fenêtre de {@code tokens} jetons ; {@link #UNKNOWN} : le fournisseur ne la dit pas, la valeur des réglages. */
    private static ModelWindow window(int tokens, boolean think) {
        if (tokens == UNKNOWN) {
            return new ModelWindow("gpt", AiProviderSettings.DEFAULT_CONTEXT, true, ContextBudget.answerRoom(AiProviderSettings.DEFAULT_CONTEXT, think));
        }
        return new ModelWindow("model", tokens, false, ContextBudget.answerRoom(tokens, think));
    }

    private static ContextBudget budget(int tokens, int system, int tools, int attached, int message) {
        return new ContextBudget(window(tokens, false), system, tools, attached, message);
    }

    @ParameterizedTest(name = "fenêtre {0}, raisonnement {1} : {2} jetons gardés à la réponse")
    @CsvSource({
        "4096,   false, 1024",
        "8192,   false, 2048",
        "32768,  false, 2048",
        "128000, false, 2048",
        "16384,  false, 2048",
        "4096,   true,  2048",
        "8192,   true,  4096",
        "16384,  true,  8192",
        "32768,  true,  8192",
        "128000, true,  8192",
    })
    @DisplayName("la place de la réponse : 2 048 jetons (8 192 si le modèle raisonne), sans manger une petite fenêtre")
    void answerRoom(int window, boolean think, int expected) {
        assertThat(ContextBudget.answerRoom(window, think)).isEqualTo(expected);
    }

    @ParameterizedTest(name = "fenêtre {0} : prompt {1} au plus, compaction à {2}, historique {3}, après compaction {4}, résumé {5} mots")
    @CsvSource({
        // 1 200 de consignes, 800 d'outils, rien de joint, 100 de demande.
        "4096,   3040,   2784,   684,    113,    122",
        "8192,   6112,   5600,   3500,   2325,   245",
        "32768,  30688,  26214,  26540,  15594,  983",
        "128000, 125920, 102400, 115820, 72700,  1000",
        // La fenêtre inconnue : la valeur prudente des réglages, 16 384.
        "-1,     14304,  13107,  11180,  6748,   491",
    })
    @DisplayName("le budget d'une requête, de la plus petite fenêtre à la plus grande, et quand elle n'est pas connue")
    void theBudgetOfARequest(int tokens, int capacity, int compactAt, int history, int verbatim, int words) {
        ContextBudget budget = budget(tokens, 1_200, 800, 0, 100);

        assertThat(budget.fits()).isTrue();
        assertThat(budget.fixed()).isEqualTo(2_100);
        assertThat(budget.capacity()).isEqualTo(capacity);
        assertThat(budget.compactAt()).isEqualTo(compactAt);
        assertThat(budget.historyRoom()).isEqualTo(history);
        assertThat(budget.summaryWords()).isEqualTo(words);
        assertThat(budget.summaryTokens()).isEqualTo(words * 2);
        assertThat(budget.verbatimRoom(budget.summaryTokens())).isEqualTo(verbatim);
    }

    @ParameterizedTest(name = "fenêtre {0} : {1} messages de 400 jetons gardés sur 1 000")
    @CsvSource({"4096, 1", "8192, 8", "32768, 66", "128000, 289", "-1, 27"})
    @DisplayName("l'historique se choisit par le budget, le plus récent d'abord : un grand modèle garde bien plus qu'un petit")
    void aLargeWindowKeepsFarMore(int tokens, int kept) {
        int[] thousand = new int[1_000];
        java.util.Arrays.fill(thousand, 400);

        assertThat(ContextBudget.keepNewest(thousand, budget(tokens, 1_200, 800, 0, 100).historyRoom())).isEqualTo(kept);
    }

    static Stream<Arguments> tooBig() {
        return Stream.of(
            Arguments.of(4_096, 2_500, 800, 0, false, "les consignes et les outils de Cortex ne tiennent pas un petit modèle"),
            Arguments.of(8_192, 3_000, 2_500, 700, false, "un document joint de trop"),
            Arguments.of(8_192, 3_000, 2_500, 500, true, "juste assez"),
            Arguments.of(32_768, 3_000, 2_500, 12_000, true, "la même demande tient une fenêtre plus grande"),
            Arguments.of(UNKNOWN, 3_000, 2_500, 8_000, true, "la valeur prudente aussi"),
            Arguments.of(128_000, 3_000, 2_500, 118_000, true, "la limite d'une grande fenêtre"),
            Arguments.of(128_000, 3_000, 2_500, 120_500, false, "même une grande fenêtre a une fin"));
    }

    @ParameterizedTest(name = "fenêtre {0}, {1}+{2}+{3} jetons : {5}")
    @MethodSource("tooBig")
    @DisplayName("sans historique, la requête tient la fenêtre, ou elle ne part pas")
    void fits(int tokens, int system, int tools, int attached, boolean fits, String why) {
        assertThat(budget(tokens, system, tools, attached, 100).fits()).as(why).isEqualTo(fits);
    }

    @ParameterizedTest(name = "fenêtre {0}, historique {1} : compaction {2}")
    @CsvSource({
        // Le seuil est atteint avec les consignes (2 100) : à 16 384 jetons, 13 107 = 80 %.
        "-1,     11007,  false",
        "-1,     11008,  true",
        "8192,   3500,   false",
        "8192,   3501,   true",
        "32768,  24114,  false",
        "32768,  24115,  true",
        "128000, 100300, false",
        "128000, 100301, true",
    })
    @DisplayName("passé environ 80 % de la fenêtre, et avant que l'historique ne tienne plus, la compaction est due")
    void compactionDue(int tokens, int history, boolean due) {
        assertThat(budget(tokens, 1_200, 800, 0, 100).compactionDue(history)).isEqualTo(due);
    }

    @Test
    @DisplayName("sans outils, rien n'est gardé à la boucle : l'historique prend tout ce qui reste")
    void noToolsNoToolRoom() {
        assertThat(budget(8_192, 1_200, 0, 0, 100).historyRoom()).isEqualTo(6_112 - 1_300);
        assertThat(budget(8_192, 1_200, 0, 0, 100).compactAt()).isEqualTo(6_112);
    }

    @Test
    @DisplayName("ce qui est joint compte comme le reste")
    void attachedCounts() {
        assertThat(budget(8_192, 1_200, 800, 1_500, 100).historyRoom()).isEqualTo(2_000);
    }

    @Test
    @DisplayName("une requête qui déborde laisse zéro à l'historique, jamais moins")
    void noNegativeRoom() {
        ContextBudget budget = budget(4_096, 5_000, 0, 0, 100);

        assertThat(budget.historyRoom()).isZero();
        assertThat(budget.verbatimRoom(100)).isZero();
    }

    @Test
    @DisplayName("Anthropic : la place de la réponse vient de son plafond, gardée telle quelle")
    void answerRoomFromTheWindow() {
        ContextBudget budget = new ContextBudget(new ModelWindow("claude", 1_000_000, false, 16_000), 1_000, 0, 0, 100);

        assertThat(budget.capacity()).isEqualTo(1_000_000 - 16_000 - 32);
        assertThat(budget.compactAt()).isEqualTo(800_000);
    }

    @Test
    @DisplayName("aucun modèle connu : rien ne se compacte ni ne se coupe")
    void unbounded() {
        ContextBudget budget = new ContextBudget(ModelWindow.UNBOUNDED, 5_000, 2_000, 0, 100);

        assertThat(budget.fits()).isTrue();
        assertThat(budget.compactionDue(1_000_000)).isFalse();
    }

    @ParameterizedTest(name = "{0} : {1} jetons")
    @CsvSource({
        "'', 0",
        "abc, 1",
        "abcd, 2",
        "résumé, 2",
        "日本語のテキスト, 8",
    })
    @DisplayName("l'estimation : un tiers de jeton par caractère latin, un jeton par caractère au-delà")
    void tokens(String text, int expected) {
        assertThat(ContextBudget.tokens(text)).isEqualTo(expected);
    }

    @Test
    @DisplayName("un message s'estime tel qu'il part, en JSON ; un texte absent ne pèse rien")
    void tokensOfJson() {
        assertThat(ContextBudget.tokensOf(new ObjectMapper(), Map.of("role", "user", "content", "bonjour")))
            .isEqualTo(ContextBudget.tokens("{\"role\":\"user\",\"content\":\"bonjour\"}"));
        assertThat(ContextBudget.tokens(null)).isZero();
    }

    static Stream<Arguments> newest() {
        return Stream.of(
            Arguments.of(new int[] {100, 100, 100}, 250, 2),
            Arguments.of(new int[] {100, 100, 100}, 300, 3),
            Arguments.of(new int[] {100, 100, 100}, 99, 0),
            Arguments.of(new int[] {100, 900, 100}, 500, 1),
            Arguments.of(new int[] {}, 500, 0),
            Arguments.of(new int[] {100}, -5, 0));
    }

    @ParameterizedTest
    @MethodSource("newest")
    @DisplayName("on garde les plus récents, sans trou : on s'arrête au premier qui ne tient pas")
    void keepNewest(int[] oldestFirst, int room, int kept) {
        assertThat(ContextBudget.keepNewest(oldestFirst, room)).isEqualTo(kept);
    }

    @Test
    @DisplayName("un historique tout fait passe par le même budget : les plus récents, et le compte de ce qui reste dehors")
    void aReadyMadeHistory() {
        List<Map<String, Object>> history = List.of(
            Map.of("role", "user", "content", "a".repeat(9_000)),
            Map.of("role", "assistant", "content", "b".repeat(300)),
            Map.of("role", "user", "content", "c".repeat(300)));

        TurnHistory.Fitted fitted = TurnHistory.of(history).fit(budget(4_096, 1_200, 800, 0, 100), "fast");

        assertThat(fitted.messages()).containsExactly(history.get(1), history.get(2));
        assertThat(fitted.leftOut()).isEqualTo(1);
        assertThat(fitted.summarized()).isZero();
    }
}
