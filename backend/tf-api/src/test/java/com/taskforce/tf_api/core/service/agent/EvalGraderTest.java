package com.taskforce.tf_api.core.service.agent;

import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import com.taskforce.tf_api.core.service.LlmUsage;
import com.taskforce.tf_api.core.service.agent.ReplayOutcome.ReplayCall;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Les notes de la banque : du code seulement, la même note pour les mêmes sorties.
 */
@DisplayName("Notes d'un cas de la banque")
class EvalGraderTest {

    private static final ReplayCall CREATE = new ReplayCall("create_issue",
        "{\"project\":\" CLEANU \",\"title\":\"Kernel check\",\"priority\":3}", "allow", "pending");
    private static final ReplayCall LIST = new ReplayCall("list_projects", "{}", "allow", "success");

    private static ReplayOutcome outcome(String answer, ReplayCall... calls) {
        return new ReplayOutcome(answer, List.of(calls), "qwen3:8b", LlmUsage.ZERO);
    }

    private static EvalCriteria tool(String tool, Map<String, List<String>> args, String effect) {
        return new EvalCriteria(tool, args, effect, null, null, null);
    }

    static Stream<Arguments> cases() {
        return Stream.of(
            Arguments.of("l'outil attendu, avec ses arguments", tool("create_issue",
                Map.of("project", List.of("cleanu", "Cleanup check")), "allow"), outcome("ok", LIST, CREATE), true),
            Arguments.of("un nombre se compare à sa forme écrite", tool("create_issue",
                Map.of("priority", List.of("3")), null), outcome("ok", CREATE), true),
            Arguments.of("un autre argument que ceux acceptés", tool("create_issue",
                Map.of("project", List.of("WEB")), null), outcome("ok", CREATE), false),
            Arguments.of("un argument absent", tool("create_issue",
                Map.of("dueDate", List.of("2026-11-06")), null), outcome("ok", CREATE), false),
            Arguments.of("l'outil attendu n'est pas appelé", tool("create_issue", null, null), outcome("ok", LIST), false),
            Arguments.of("l'effet de la règle diffère", tool("create_issue", null, "ask"), outcome("ok", CREATE), false),
            Arguments.of("aucun outil, aucun appel", tool(EvalCriteria.NO_TOOL, null, null), outcome("Hello."), true),
            Arguments.of("aucun outil, mais un appel", tool(EvalCriteria.NO_TOOL, null, null), outcome("ok", LIST), false),
            Arguments.of("un outil interdit, appelé", new EvalCriteria(null, null, null, List.of("create_project"), null, null),
                outcome("ok", new ReplayCall("create_project", "{}", "ask", "pending")), false),
            Arguments.of("un outil interdit, absent", new EvalCriteria(null, null, null, List.of("create_project"), null, null),
                outcome("ok", LIST), true),
            Arguments.of("des mots attendus, la casse ignorée", new EvalCriteria(null, null, null, null,
                List.of("tf-3"), List.of("created")), outcome("TF-4 is blocked by TF-3."), true),
            Arguments.of("un mot interdit dans la réponse", new EvalCriteria(null, null, null, null,
                null, List.of("created")), outcome("Issue created: TF-31."), false),
            Arguments.of("aucun critère ne fait pas passer", new EvalCriteria(null, null, null, null, null, null),
                outcome("ok"), false)
        );
    }

    @ParameterizedTest(name = "{0} : {3}")
    @MethodSource("cases")
    void grades_by_code(String label, EvalCriteria criteria, ReplayOutcome outcome, boolean passed) {
        assertThat(EvalGrader.grade(criteria, outcome).passed()).isEqualTo(passed);
    }

    @Test
    @DisplayName("la même sortie donne la même note, critère par critère")
    void the_same_output_gives_the_same_grade() {
        EvalCriteria criteria = new EvalCriteria("create_issue", Map.of("project", List.of("CLEANU")), "allow",
            List.of("create_project"), List.of("kernel"), List.of("created"));
        ReplayOutcome same = outcome("Kernel check is proposed.", CREATE);

        assertThat(EvalGrader.grade(criteria, same)).isEqualTo(EvalGrader.grade(criteria, same));
        assertThat(EvalGrader.grade(criteria, same).checks()).extracting(EvalGrader.Check::criterion).containsExactly(
            "calls create_issue", "with project = CLEANU", "rule effect allow", "does not call create_project",
            "says \"kernel\"", "does not say \"created\"");
    }

    @Test
    @DisplayName("des arguments illisibles ne correspondent à rien")
    void unreadable_arguments_match_nothing() {
        assertThat(EvalGrader.argsMatch(Map.of("project", List.of("CLEANU")), "{not json")).isFalse();
    }
}
