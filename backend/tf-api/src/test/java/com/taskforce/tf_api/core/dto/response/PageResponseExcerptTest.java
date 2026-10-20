package com.taskforce.tf_api.core.dto.response;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.time.Duration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

@DisplayName("PageResponse : aperçu d'une page")
class PageResponseExcerptTest {

    /** L'ancien calcul, par expressions régulières : la référence sur les contenus ordinaires. */
    private static String previous(String content) {
        String plain = content.replaceAll("<[^>]*>", "").replaceAll("\\s+", " ").trim();
        return plain.length() > 150 ? plain.substring(0, 150) + "…" : plain;
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {
        "Texte simple",
        "<p>Paragraphe</p><p>suivant</p>",
        "  espaces \t multiples \n et lignes  ",
        "a <b>gras</b> c",
        "a<b>c",
        "<a<b>c",
        "inférieur < sans fermeture",
        "deux << sans > puis <i>texte</i>",
        "<p></p>",
        "<h1>Notes de réunion</h1><p>Le lot D.3 avance : base embarquée, sauvegarde avant migration, export complet, "
            + "migration des projets à la demande dans les deux sens, et la photo de profil reste à reprendre.</p>",
        "# Titre markdown\n\nUn paragraphe assez long pour dépasser la limite de cent cinquante caractères de l'aperçu, "
            + "avec des espaces    en trop et un saut de ligne final.\n",
    })
    void same_excerpt_as_before(String content) {
        assertThat(PageResponse.buildExcerpt(content)).isEqualTo(previous(content));
    }

    @Test
    @DisplayName("sans contenu : le texte d'attente")
    void no_content() {
        assertThat(PageResponse.buildExcerpt(null)).isEqualTo("No content yet.");
        assertThat(PageResponse.buildExcerpt("  \n ")).isEqualTo("No content yet.");
    }

    @Test
    @DisplayName("un contenu fait de « < » sans « > » reste rapide")
    void unclosed_tags_stay_fast() {
        String content = "<".repeat(300_000);
        String excerpt = assertTimeoutPreemptively(Duration.ofSeconds(2), () -> PageResponse.buildExcerpt(content));
        assertThat(excerpt).isEqualTo("<".repeat(150) + "…");
    }
}
