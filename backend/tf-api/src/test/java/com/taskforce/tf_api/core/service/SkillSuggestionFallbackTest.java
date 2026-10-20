package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

@DisplayName("SkillSuggestionService : repli par mots-clés du rôle, sans LLM")
class SkillSuggestionFallbackTest {

    private final SkillSuggestionService service = new SkillSuggestionService(null, null, null, null, null);

    @ParameterizedTest(name = "« {0} » → {1}")
    @CsvSource(delimiter = '|', value = {
        "frontend developer   | React",
        "backend engineer     | Java",
        "full stack           | TypeScript",
        "sre                  | Docker",
        "ux researcher        | Figma",
        "qa                   | Playwright",
        "data analyst         | SQL",
        "scrum master         | Agile",
        "comptable            | Communication",
    })
    void picks_the_list_of_the_first_matching_keyword(String role, String first) {
        assertThat(service.fallback(role, List.of())).first().isEqualTo(first);
    }

    @Test
    @DisplayName("sans rôle : la liste générale")
    void no_role() {
        assertThat(service.fallback(null, List.of())).first().isEqualTo("Communication");
    }

    @Test
    @DisplayName("un rôle très long reste rapide (plus d'expression régulière sur le texte saisi)")
    void long_role_stays_fast() {
        String role = "ui".repeat(500_000) + "!";
        assertTimeoutPreemptively(Duration.ofSeconds(2), () -> service.fallback(role, List.of()));
    }
}
