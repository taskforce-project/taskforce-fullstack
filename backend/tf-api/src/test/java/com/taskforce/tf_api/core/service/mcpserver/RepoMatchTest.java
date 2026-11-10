package com.taskforce.tf_api.core.service.mcpserver;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * Les dépôts de la personne face à ce qu'elle écrit (test du CEO du 05/11/2026) : sans la casse, les espaces, les tirets
 * ni le propriétaire, le nom le plus long l'emportant, et les plus proches d'abord quand aucun n'est nommé.
 */
@DisplayName("Les dépôts de la personne face à ce qu'elle écrit")
class RepoMatchTest {

    private static final List<String> MINE = List.of("Miche1-Pierre/site", "Miche1-Pierre/test-taskforce",
        "Miche1-Pierre/test", "acme/site", "acme/go");

    private static List<String> list(String values) {
        return values == null || values.isBlank() ? List.of() : Arrays.asList(values.split(","));
    }

    @ParameterizedTest(name = "« {0} » : {1}")
    @CsvSource(delimiter = '|', nullValues = "-", value = {
        "test-taskforce est un repo normalement nan ?   | Miche1-Pierre/test-taskforce",
        "test taskforce est un repo regarde bien        | Miche1-Pierre/test-taskforce",
        "Test_TaskForce                                 | Miche1-Pierre/test-taskforce",
        "MICHE1-PIERRE/TEST-TASKFORCE                   | Miche1-Pierre/test-taskforce",
        "c'est acme/site normalement                    | acme/site",
        "le repo test                                   | Miche1-Pierre/test",
        "site                                           | Miche1-Pierre/site,acme/site",
        "on va utiliser go                              | -",
        "go                                             | acme/go",
        "le dépôt habituel                              | -",
        "-                                              | -",
    })
    void what_names_a_repository(String said, String expected) {
        assertThat(RepoMatch.matching(said == null ? "" : said, MINE)).containsExactlyElementsOf(list(expected));
    }

    @ParameterizedTest(name = "« {0} » : {1}")
    @CsvSource(delimiter = '|', value = {
        // Une faute de frappe : le plus ressemblant d'abord.
        "test-tasforce                | Miche1-Pierre/test-taskforce,Miche1-Pierre/test",
        "the test repository           | Miche1-Pierre/test,Miche1-Pierre/test-taskforce",
        // Rien ne ressemble : les plus récents, dans leur ordre.
        "zzz                           | Miche1-Pierre/site,Miche1-Pierre/test-taskforce",
    })
    void the_closest_come_first(String said, String expected) {
        assertThat(RepoMatch.closest(said, MINE, 2)).containsExactlyElementsOf(list(expected));
    }

    /**
     * Ceux qui ressemblent au nom, à la pile ou à la demande d'abord, les plus ressemblants en tête ; les autres gardent
     * l'ordre de GitHub, du plus récemment actif au plus ancien.
     */
    @ParameterizedTest(name = "indices {0} : {1}")
    @CsvSource(delimiter = '|', value = {
        "Atlas                         | acme/atlas-web,acme/atlas-docs,acme/a,acme/b",
        "Atlas Web~Next.js             | acme/atlas-web,acme/atlas-docs,acme/a,acme/b",
        "~Next.js~crée un projet Next.js | acme/a,acme/b,acme/atlas-web,acme/atlas-docs",
    })
    void the_ranking_puts_resemblance_first_then_recent_activity(String hints, String expected) {
        List<String> repos = List.of("acme/a", "acme/b", "acme/atlas-web", "acme/atlas-docs");

        assertThat(RepoMatch.ranked(repos, Arrays.asList(hints.split("~", -1)))).containsExactlyElementsOf(list(expected));
    }

    @ParameterizedTest(name = "« {0} » : nouveau {1}, visibilité {2}")
    @CsvSource(delimiter = '|', nullValues = "-", value = {
        "un nouveau dépôt privé            | true  | private",
        "create a new public one           | true  | public",
        "crée-le                           | true  | -",
        "test-taskforce est un repo        | false | -",
    })
    void what_a_typed_answer_asks(String said, boolean fresh, String visibility) {
        assertThat(RepoMatch.wantsNew(said)).isEqualTo(fresh);
        assertThat(RepoMatch.visibility(said)).isEqualTo(visibility);
    }

    @ParameterizedTest(name = "« {0} » et {1} : {2}")
    @CsvSource(delimiter = '|', nullValues = "-", value = {
        "Atlas Web   | acme/atlas-web,acme/site      | acme/atlas-web",
        "atlas-web   | acme/Atlas_Web,acme/site      | acme/Atlas_Web",
        "Atlas       | acme/atlas-web,acme/site      | -",
        "Site        | acme/site,perso/site          | -",
    })
    void the_repository_with_the_project_name(String name, String repos, String expected) {
        assertThat(RepoMatch.named(name, list(repos))).isEqualTo(expected);
    }
}
