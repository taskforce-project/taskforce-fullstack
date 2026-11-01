package com.taskforce.tf_api.core.harness.rules;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/** Expérience E16 : la décision d'un appel d'outil entier, comme {@code decideAll} du runner, avec la table par défaut. */
@DisplayName("E16 : décision d'un appel d'outil par le backend")
class RulesDecisionServiceTest {

    private static final RulesDecisionService SERVICE = new RulesDecisionService();

    private static Map<String, String> shell(String command) {
        return Map.of("action", "shell", "tool", "Bash", "command", command);
    }

    static Stream<Arguments> calls() {
        return Stream.of(
            Arguments.of("aucun fait (outil interne) : autorisé, sans règle", List.of(), "allow", null),
            Arguments.of("une lecture de git", List.of(shell("git status")), "allow", "run-git-reads"),
            Arguments.of("une commande composée prend le plus strict",
                List.of(shell("git status"), shell("git push origin main")), "deny", "no-agent-push"),
            Arguments.of("un morceau qu'aucune règle ne couvre est demandé",
                List.of(shell("git status"), shell("ls -la")), "ask", null),
            Arguments.of("une lecture hors de la copie, sans son action, est demandée",
                List.of(Map.of("action", "file.read", "tool", "Read", "path", "/etc/hosts"),
                    Map.of("tool", "Read", "path", "/etc/hosts")), "ask", null),
            Arguments.of("à effet égal, le premier fait l'emporte",
                List.of(Map.of("action", "file.read", "path", "a.ts"), Map.of("action", "file.write", "path", "a.ts")),
                "allow", "read-files"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("calls")
    void decide(String name, List<Map<String, String>> facts, String effect, String rule) {
        RulesEngine.Decision decision = SERVICE.decide(facts);
        assertThat(decision.effect()).isEqualTo(effect);
        assertThat(decision.rule() == null ? null : decision.rule().id()).isEqualTo(rule);
    }
}
