package com.taskforce.tf_api.core.service.agent;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.taskforce.tf_api.core.service.integration.ConnectorCatalog;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Où écrit un outil, et quels outils une demande nomme (R204) : du code seulement, sur le vrai catalogue. Le 17/11/2026,
 * « crée un projet dans Linear » a créé un projet dans TaskForce, et rien ne le disait.
 */
@DisplayName("Où écrit un outil, et ce qu'une demande nomme (R204)")
class TargetSystemsTest {

    private static final TargetSystems TARGETS = new TargetSystems(catalog());

    private static ConnectorCatalog catalog() {
        ConnectorCatalog catalog = new ConnectorCatalog();
        catalog.build();
        return catalog;
    }

    @ParameterizedTest(name = "{0} : {1}")
    @CsvSource(delimiter = '|', value = {
        "create_project             | TaskForce",
        "linear__save_issue         | Linear",
        "github-mcp__create_issue   | GitHub",
        "google-drive__search_files | Google Drive",
        "custom-acme-tools__run     | Acme Tools",
    })
    void a_tool_writes_in_its_system(String tool, String system) {
        assertThat(TARGETS.of(tool)).isEqualTo(system);
    }

    @ParameterizedTest(name = "« {0} » nomme : {1}")
    @CsvSource(delimiter = '|', value = {
        // Les mots de la Présidence à la recette (s17), puis ce qu'une personne écrit d'ordinaire.
        "Tu peux me creer un nouveau projet dans Linear la ou pas ?   | Linear",
        "Tu l'as creer ou ? Je le vois pas dans linear                 | Linear",
        "crée une tâche dans Linear                                    | Linear",
        "Create an issue in Linear and a page in Notion               | Linear;Notion",
        "Ajoute ça dans Google Drive                                   | Google Drive",
        "Ouvre une PR sur GitHub                                       | GitHub",
        "Crée un scénario dans Make                                    | Make",
        // Un mot courant ne nomme rien sans sa préposition ; un jour n'est pas monday.com ; TaskForce n'est pas un outil.
        "Make a task for the release                                   | ",
        "La notion de projet est floue                                 | ",
        "What changed on Monday?                                       | ",
        "Close TF-12                                                   | ",
        "Crée un projet dans TaskForce                                 | ",
        "Résume le projet                                              | ",
    })
    void a_request_names_the_tools_of_the_catalog(String request, String names) {
        List<String> expected = names == null || names.isBlank() ? List.of() : List.of(names.trim().split(";"));

        assertThat(TARGETS.namedIn(request)).extracting(TargetSystems.Named::name).containsExactlyElementsOf(expected);
    }

    @Test
    @DisplayName("un outil nommé se reconnaît à son nom comme à sa clé, la native avec son second accès (R160)")
    void a_named_tool_is_known_by_its_name_and_keys() {
        TargetSystems.Named github = TARGETS.namedIn("Ouvre une PR sur GitHub").get(0);

        assertThat(github.keys()).contains("github", "github-mcp");
        assertThat(github.is("GitHub")).isTrue();
        assertThat(github.is("github-mcp")).isTrue();
        assertThat(github.is("TaskForce")).isFalse();
    }
}
