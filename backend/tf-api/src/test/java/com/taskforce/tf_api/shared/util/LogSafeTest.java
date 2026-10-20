package com.taskforce.tf_api.shared.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;

@DisplayName("LogSafe : valeur venue de l'extérieur, prête à journaliser")
class LogSafeTest {

    static Stream<Arguments> values() {
        return Stream.of(
            Arguments.of("adresse ordinaire", "ada@taskforce.dev", "ada@taskforce.dev"),
            Arguments.of("fausse ligne de journal", "ada\n2026-10-20 INFO Connexion réussie", "ada_2026-10-20 INFO Connexion réussie"),
            Arguments.of("CRLF compté comme un seul saut", "a\r\nb", "a_b"),
            Arguments.of("retour chariot seul", "a\rb", "a_b"),
            Arguments.of("séparateur de ligne Unicode", "a b", "a_b"),
            Arguments.of("tabulation", "a\tb", "a b"),
            Arguments.of("valeur absente", null, "null"),
            Arguments.of("autre qu'une chaîne", 42L, "42"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("values")
    void neutralizes_line_breaks(String label, Object value, String expected) {
        assertThat(LogSafe.of(value)).isEqualTo(expected);
    }

    @ParameterizedTest(name = "{0} caractères")
    @CsvSource({"200, 200", "201, 203", "5000, 203"})
    void bounds_the_length(int length, int expected) {
        assertThat(LogSafe.of("x".repeat(length))).hasSize(expected);
    }
}
