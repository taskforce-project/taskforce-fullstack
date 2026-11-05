package com.taskforce.tf_api.core.service.agent;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import static org.assertj.core.api.Assertions.assertThat;

/** Le genre d'une demande, lu par du code dans ses mots (R118) : les outils, le code, la langue, et sa taille. */
@DisplayName("RequestKinds")
class RequestKindsTest {

    static Stream<Arguments> requests() {
        return Stream.of(
            // Les échanges de la Présidence du 02/11/2026 (séance n°17).
            Arguments.of("suprime testta 2", Set.of(Capability.TOOLS)),
            Arguments.of("liste moi les issues dans test taskforce", Set.of(Capability.TOOLS, Capability.FRENCH)),
            Arguments.of("What changed in this project this week?", Set.of(Capability.TOOLS, Capability.ENGLISH)),
            Arguments.of("Move ATLAS-3 to Done.", Set.of(Capability.TOOLS, Capability.ENGLISH)),
            Arguments.of("What is TaskForce?", Set.of(Capability.ENGLISH)),
            Arguments.of("Que fait ce code ? ```js\nconsole.log([1].sort())\n```", Set.of(Capability.CODE, Capability.FRENCH)),
            Arguments.of("Why does `items.sort()` sort numbers as text in javascript?",
                Set.of(Capability.CODE, Capability.ENGLISH)),
            Arguments.of("Bonjour, ça va ?", Set.of(Capability.FRENCH)),
            Arguments.of("ok", Set.of()));
    }

    @ParameterizedTest(name = "{0} : {1}")
    @MethodSource("requests")
    @DisplayName("le genre se lit dans les mots de la demande")
    void readsTheKinds(String message, Set<Capability> kinds) {
        assertThat(RequestKinds.of(message, List.of()).kinds()).containsExactlyInAnyOrderElementsOf(kinds);
    }

    @Test
    @DisplayName("la taille compte la demande et l'historique que le modèle relira")
    void countsTheHistory() {
        List<Map<String, Object>> history = List.of(
            Map.of("role", "user", "content", "one two three"),
            Map.of("role", "assistant", "content", "four five"));
        assertThat(RequestKinds.of("six seven", history).words()).isEqualTo(7);
        assertThat(RequestKinds.of(null, null).words()).isZero();
        assertThat(RequestKinds.of(null, null).kinds()).isEmpty();
    }
}
