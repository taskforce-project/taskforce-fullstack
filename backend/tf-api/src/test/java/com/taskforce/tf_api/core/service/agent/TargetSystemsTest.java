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

    @ParameterizedTest(name = "« {0} » lit ou écrit dans : {1}")
    @CsvSource(delimiter = '|', value = {
        // Relecture R159 (5) : un nom qui est aussi un mot courant ne nomme un outil que comme lieu.
        "Create an issue: the linear progress bar jumps back          | ",
        "Crée une issue pour corriger l'amplitude du graphe           | ",
        "Add a task to give the team some slack before the release    | ",
        "Is this plan workable for the sprint?                        | ",
        "We need a better stack for the frontend, create an issue     | ",
        // (4) : une source est un lieu où lire ; un constat n'est pas une demande.
        "Crée un projet TaskForce à partir du projet Linear Roadmap   | Linear",
        "C'est mergé sur GitHub, passe TF-12 en Done                  | ",
        "It's merged on GitHub, move TF-12 to Done                    | ",
        // (6) : « à » est un lieu, une page Notion aussi, et Notion après « Search ».
        "Ajoute une page à Notion                                     | Notion",
        "Résume ma page Notion Roadmap                                | Notion",
        "Search Notion for the roadmap                                | Notion",
    })
    void a_request_names_a_tool_only_as_a_place(String request, String names) {
        List<String> expected = names == null || names.isBlank() ? List.of() : List.of(names.trim().split(";"));

        assertThat(TARGETS.namedIn(request)).extracting(TargetSystems.Named::name).containsExactlyElementsOf(expected);
    }

    @ParameterizedTest(name = "« {0} » écrit dans : {1}")
    @CsvSource(delimiter = '|', value = {
        // Relecture R159 (4) : la cible est le lieu rattaché au verbe d'écriture, jamais une source ; TaskForce se nomme.
        "Tu peux me creer un nouveau projet dans Linear la ou pas ?  | Linear",
        "crée une tâche dans Linear                                  | Linear",
        "Crée un projet TaskForce à partir du projet Linear Roadmap  | TaskForce",
        "crée une issue TaskForce à partir de ce ticket Linear       | TaskForce",
        "Create a TaskForce project from the Linear project Roadmap  | TaskForce",
        "Create a Linear issue for the login bug                     | Linear",
        "Crée un projet dans TaskForce                               | TaskForce",
        "Résume TF-21 et poste-le sur Slack                          | Slack",
        "Ajoute une page à Notion                                    | Notion",
        "Create an issue in Linear and a page in Notion              | Linear;Notion",
        // Rien à écrire là : un constat, une lecture, une question sur ce qui a été fait.
        "C'est mergé sur GitHub, passe TF-12 en Done                 | ",
        "Qu'est-ce qui se passe dans Linear ?                        | ",
        "Quels sont les nouveaux tickets dans Linear ?               | ",
        "Montre-moi ce qui a été fait dans Linear                    | ",
        "Tu l'as creer ou ? Je le vois pas dans linear               | ",
    })
    void a_write_goes_where_its_verb_says(String request, String targets) {
        List<String> expected = targets == null || targets.isBlank() ? List.of() : List.of(targets.trim().split(";"));

        assertThat(TARGETS.said(request).targets()).extracting(TargetSystems.Named::name)
            .containsExactlyElementsOf(expected);
    }

    @Test
    @DisplayName("R159 (4) : une écriture ailleurs que la cible le dit ; une écriture sans lieu, dans TaskForce, non")
    void a_write_elsewhere_than_the_target_is_said() {
        TargetSystems.Said linear = TARGETS.said("Crée un projet dans Linear");
        TargetSystems.Said taskforce = TARGETS.said("Crée un projet dans TaskForce");
        TargetSystems.Said both = TARGETS.said("Crée une tâche et poste-la sur Slack");

        assertThat(linear.elsewhere("TaskForce")).extracting(TargetSystems.Named::name).isEqualTo("Linear");
        assertThat(linear.elsewhere("Linear")).isNull();
        assertThat(linear.writesOnlyElsewhere()).isTrue();
        assertThat(taskforce.elsewhere("Linear")).extracting(TargetSystems.Named::name).isEqualTo("TaskForce");
        assertThat(taskforce.writesOnlyElsewhere()).isFalse();
        assertThat(both.elsewhere("TaskForce")).isNull();
        assertThat(both.writesOnlyElsewhere()).isFalse();
        assertThat(TARGETS.said("Liste les projets").elsewhere("Linear")).isNull();
    }

    @ParameterizedTest(name = "« {0} » écrit dans : {1}")
    @CsvSource(delimiter = '|', value = {
        // Un participe qui suit l'écriture décrit ce qu'elle écrit : le lieu qui suit reste le sien.
        "Crée une issue, assignée à Marie, dans Linear   | Linear",
        "Create an issue, assigned to Marie, in Linear   | Linear",
        "Merged on GitHub, move TF-12 to Done            | ",
    })
    void a_participle_after_a_write_keeps_its_place(String request, String targets) {
        List<String> expected = targets == null || targets.isBlank() ? List.of() : List.of(targets.trim().split(";"));

        assertThat(TARGETS.said(request).targets()).extracting(TargetSystems.Named::name)
            .containsExactlyElementsOf(expected);
    }
}
