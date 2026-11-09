package com.taskforce.tf_api.core.service.brain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** Le passage qui répond à une recherche (Ctrl+K, R141) : du texte brut, autour du mot trouvé. */
@DisplayName("SearchExcerpt")
class SearchExcerptTest {

    @ParameterizedTest(name = "{0} donne {1}")
    @CsvSource(delimiter = ';', value = {
        "**Important** note ; Important note",
        "See [the doc](https://example.org/a) here ; See the doc here",
        "See [[Deploy guide|the guide]] here ; See Deploy guide here",
        "![shot](a.png) then text ; then text",
        "# Title ; Title",
        "> a quote with `code` ; a quote with code",
        "several   spaces ; several spaces",
    })
    @DisplayName("enlève la mise en forme")
    void strips_the_marks(String content, String plain) {
        assertThat(SearchExcerpt.plain(content)).isEqualTo(plain);
    }

    @Test
    @DisplayName("un texte vide reste vide")
    void no_content() {
        assertThat(SearchExcerpt.around(null, List.of("x"))).isEmpty();
    }

    @Test
    @DisplayName("un texte court se rend en entier")
    void short_text_is_whole() {
        assertThat(SearchExcerpt.around("The deploy failed on Monday", List.of("deploy"))).isEqualTo("The deploy failed on Monday");
    }

    @Test
    @DisplayName("un long texte se coupe autour du mot, à des mots entiers, avec des points de suspension")
    void long_text_is_cut_around_the_word() {
        String before = "word ".repeat(60);
        String after = "tail ".repeat(60);

        String excerpt = SearchExcerpt.around(before + "needle in the text " + after, List.of("needle"));

        assertThat(excerpt).startsWith("…").endsWith("…").contains("needle in the text");
        assertThat(excerpt.length()).isLessThanOrEqualTo(SearchExcerpt.LENGTH + 2);
        assertThat(excerpt).doesNotContain("wor…").doesNotContain("…ord");
    }

    @Test
    @DisplayName("prend le premier des mots trouvés, quel que soit leur ordre dans la recherche")
    void takes_the_first_word_found() {
        String text = "alpha ".repeat(40) + "second " + "beta ".repeat(40) + "first";

        assertThat(SearchExcerpt.around(text, List.of("first", "second"))).contains("second");
    }

    @Test
    @DisplayName("sans mot trouvé (une note trouvée par son titre), le début du texte")
    void without_a_word_it_starts_at_the_beginning() {
        String excerpt = SearchExcerpt.around("start ".repeat(50), List.of("absent"));

        assertThat(excerpt).startsWith("start").endsWith("…");
    }
}
