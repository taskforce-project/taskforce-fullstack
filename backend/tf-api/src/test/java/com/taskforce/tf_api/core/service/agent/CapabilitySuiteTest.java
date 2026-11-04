package com.taskforce.tf_api.core.service.agent;

import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import com.taskforce.tf_api.core.service.LlmUsage;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La suite fixe des cas de capacité (R113) : chaque capacité a ses cas, leurs résultats attendus sont écrits avant tout
 * rejeu, et la note vient du code, sur ce que le modèle a appelé et ce qu'il a répondu.
 */
@DisplayName("CapabilitySuite")
class CapabilitySuiteTest {

    private static ReplayOutcome answered(String answer, ReplayOutcome.ReplayCall... calls) {
        return new ReplayOutcome(answer, List.of(calls), "qwen3:8b", new LlmUsage(10, 2, 12));
    }

    private static CapabilitySuite.CapabilityCase find(String key) {
        return CapabilitySuite.find(key).orElseThrow();
    }

    @Test
    @DisplayName("deux cas par capacité, des clés uniques, chaque cas trouvé par sa clé")
    void everyCapabilityHasItsCases() {
        for (Capability capability : Capability.values()) {
            assertThat(CapabilitySuite.count(capability)).as(capability.key()).isEqualTo(capability == Capability.FRENCH
                || capability == Capability.ENGLISH ? 1 : 2);
        }
        assertThat(CapabilitySuite.cases()).extracting(CapabilitySuite.CapabilityCase::key).doesNotHaveDuplicates();
        assertThat(CapabilitySuite.find("missing")).isEmpty();
        assertThat(Capability.of("tools")).contains(Capability.TOOLS);
        assertThat(Capability.of("nope")).isEmpty();
    }

    @Test
    @DisplayName("le journal du contexte a la taille dite, son nom de code en tête et la question à la fin")
    void contextDocumentsHaveTheirSize() {
        String shortLog = CapabilitySuite.document(CapabilitySuite.SHORT_DOCUMENT);
        String longLog = CapabilitySuite.document(CapabilitySuite.LONG_DOCUMENT);
        assertThat(CapabilitySuite.wordCount(shortLog)).isBetween(500, 520);
        assertThat(CapabilitySuite.wordCount(longLog)).isBetween(3000, 3020);
        assertThat(shortLog.lines().skip(1).findFirst().orElseThrow()).contains(CapabilitySuite.CODE_NAME);
        assertThat(CapabilitySuite.document(500)).isEqualTo(shortLog);
        assertThat(find("context-long").replay().question()).endsWith("Answer with the code name only.");
        assertThat(find("context-long").documentWords()).isEqualTo(3000);
    }

    static Stream<Arguments> answers() {
        ReplayOutcome.ReplayCall move = new ReplayOutcome.ReplayCall("update_issue", "{\"issue\":\"atlas-3\",\"status\":\"done\"}",
            "allow", "pending");
        ReplayOutcome.ReplayCall elsewhere = new ReplayOutcome.ReplayCall("update_issue", "{\"issue\":\"ATLAS-4\",\"status\":\"Done\"}",
            "allow", "pending");
        ReplayOutcome.ReplayCall list = new ReplayOutcome.ReplayCall("list_issues", "{\"project\":\"ATLAS\",\"status\":\"Blocked\"}",
            "allow", "error");
        return Stream.of(
            Arguments.of("tools-move", answered("Done.", move), true),
            Arguments.of("tools-move", answered("Done.", elsewhere), false),
            Arguments.of("tools-move", answered("I moved it."), false),
            Arguments.of("tools-list", answered("None.", list), true),
            Arguments.of("context-short", answered("HERON-7"), true),
            Arguments.of("context-long", answered("The log does not give a code name."), false),
            Arguments.of("code-js-sort", answered("It prints 1,10,9 because sort compares strings."), true),
            Arguments.of("code-js-sort", answered("1,9,10"), false),
            Arguments.of("code-python-default", answered("1 2 3"), true),
            Arguments.of("code-python-default", answered("1 1 1"), false),
            Arguments.of("french-read", answered("Marc s'occupe des tests, et la version 2 sort le 14 mars."), true),
            Arguments.of("french-read", answered("Marc owns the tests; version 2 ships on March 14."), false),
            Arguments.of("english-read", answered("Marc owns the tests, and version 2 ships on March 14."), true),
            Arguments.of("english-read", answered("Marc owns the tests; it ships on the 14th of March."), true),
            Arguments.of("english-read", answered("Marc s'occupe des tests, la version 2 sort le 14 mars."), false));
    }

    @ParameterizedTest(name = "{0} : {2}")
    @MethodSource("answers")
    @DisplayName("la note vient du code : l'outil et ses arguments, puis ce que la réponse dit ou ne dit pas")
    void gradesByCode(String key, ReplayOutcome outcome, boolean passed) {
        EvalGrader.Grade grade = CapabilitySuite.grade(find(key), outcome);
        assertThat(grade.passed()).isEqualTo(passed);
        assertThat(grade.checks()).isNotEmpty();
    }
}
