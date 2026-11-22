package com.taskforce.tf_api.core.service.agent;

import java.util.EnumSet;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.taskforce.tf_api.core.service.agent.ToolChoice.Thing;
import com.taskforce.tf_api.core.service.agent.ToolChoice.Verb;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Ce qu'une demande veut, et ce que fait un outil (R204, R201 « chercher ») : en français comme en anglais, par du code.
 * Le 17/11/2026, en français, les outils de Linear restaient à égalité et gardaient l'ordre de la liste du serveur.
 */
@DisplayName("Le choix des outils connectés (R204)")
class ToolChoiceTest {

    @ParameterizedTest(name = "« {0} » : {1} sur {2}")
    @CsvSource(delimiter = '|', value = {
        // Les mots de la Présidence à la recette (s17), fautes comprises, puis ceux d'ordinaire.
        "Tu peux me creer un nouveau projet dans Linear la ou pas ?            | CREATE | PROJECT",
        "tu peux creer une tache stp ? un truc d'exemple avec une priorite      | CREATE | ISSUE",
        "fait un nouveau workspace stp                                          | CREATE | WORKSPACE",
        "crée une tâche dans Linear                                             | CREATE | ISSUE",
        "ajoute un commentaire sur ENG-12                                       | CREATE | COMMENT",
        "liste les projets de Linear                                            | READ   | PROJECT",
        "déplace le ticket dans Done                                            | UPDATE | ISSUE",
        "supprime la carte                                                      | DELETE | ISSUE",
        "create an issue in Linear                                              | CREATE | ISSUE",
        "show me the teams                                                      | READ   | TEAM",
    })
    void reads_what_a_request_asks(String request, Verb verb, Thing thing) {
        ToolChoice.Asked asked = ToolChoice.asked(request);

        assertThat(asked.verbs()).contains(verb);
        assertThat(asked.things()).contains(thing);
    }

    @ParameterizedTest(name = "{0} : {1} sur {2}")
    @CsvSource(nullValues = "-", delimiter = '|', value = {
        "linear__save_issue                   | CREATE UPDATE | ISSUE",
        "linear__save_project                 | CREATE UPDATE | PROJECT",
        "linear__list_issues                  | READ          | ISSUE",
        "linear__list_issue_statuses          | READ          | STATE",
        "linear__get_issue_status             | READ          | STATE",
        "linear__list_teams                   | READ          | TEAM",
        "linear__create_issue_label           | CREATE        | LABEL",
        "linear__get_attachment               | READ          | ATTACHMENT",
        "linear__list_agent_skills            | READ          | -",
        "asana__create_tasks                  | CREATE        | ISSUE",
        "jira__createJiraIssue                | CREATE        | ISSUE",
    })
    void reads_what_a_tool_does_from_its_name(String tool, String verbs, String thing) {
        ToolChoice.Does does = ToolChoice.does(tool);
        EnumSet<Verb> expected = EnumSet.noneOf(Verb.class);
        for (String verb : verbs.trim().split("\\s+")) expected.add(Verb.valueOf(verb));

        assertThat(does.verbs()).isEqualTo(expected);
        assertThat(does.thing()).isEqualTo(thing == null ? null : Thing.valueOf(thing));
    }

    @Test
    @DisplayName("ce qui fait ce que dit la demande d'abord, puis ce qui lit la même chose, puis ce qui aide à le faire")
    void ranks_what_does_what_was_asked_first() {
        ToolChoice.Asked asked = ToolChoice.asked("crée une tâche dans Linear");
        Map<String, Integer> scores = new java.util.LinkedHashMap<>();
        for (String name : List.of("linear__save_issue", "linear__list_issues", "linear__list_teams", "linear__save_comment",
            "linear__get_attachment", "linear__list_agent_skills")) {
            scores.put(name, ToolChoice.score(new Named(name), "crée une tâche dans Linear", asked, true));
        }

        assertThat(scores.get("linear__save_issue")).isGreaterThan(scores.get("linear__list_issues"));
        assertThat(scores.get("linear__list_issues")).isGreaterThan(scores.get("linear__list_teams"));
        assertThat(scores.get("linear__list_teams")).isGreaterThan(scores.get("linear__save_comment"));
        // Les pièces jointes et les compétences, en tête de la liste du serveur le 17/11/2026, passent après.
        assertThat(scores.get("linear__save_comment")).isGreaterThan(scores.get("linear__get_attachment"))
            .isGreaterThan(scores.get("linear__list_agent_skills"));
    }

    @Test
    @DisplayName("un outil d'un autre connecteur passe après ceux du connecteur nommé, même s'il fait ce que dit la demande")
    void the_named_connector_comes_first() {
        ToolChoice.Asked asked = ToolChoice.asked("crée une tâche dans Linear");

        assertThat(ToolChoice.score(new Named("linear__get_attachment"), "crée une tâche dans Linear", asked, true))
            .isGreaterThan(ToolChoice.score(new Named("asana__create_tasks"), "crée une tâche dans Linear", asked, false));
    }

    @Test
    @DisplayName("sous le plafond, tous les outils partent, dans leur ordre ; un plafond nul n'en donne aucun")
    void under_the_cap_every_tool_goes() {
        List<AgentTool> two = List.of(new Named("linear__get_attachment"), new Named("linear__save_issue"));

        assertThat(ToolChoice.choose(two, "crée une tâche dans Linear", List.of(), 12)).isEqualTo(two);
        assertThat(ToolChoice.choose(two, "crée une tâche dans Linear", List.of(), 0)).isEmpty();
        assertThat(ToolChoice.choose(two, "crée une tâche dans Linear", List.of(), 1)).extracting(AgentTool::name)
            .containsExactly("linear__save_issue");
    }

    /** Un outil par son seul nom, pour le classement. */
    private record Named(String name) implements AgentTool {
        @Override public String description() { return ""; }
        @Override public Map<String, Object> parametersSchema() { return Map.of(); }
        @Override public String execute(Map<String, Object> args, AgentContext ctx) { throw new UnsupportedOperationException(); }
    }

    @ParameterizedTest(name = "{0} : {1} sur {2}")
    @CsvSource(nullValues = "-", delimiter = '|', value = {
        // Relecture R159 (6) : un premier mot qui redit la clé du connecteur ne dit pas ce que fait l'outil.
        "notion__notion-search        | READ   | -",
        "notion__notion-fetch         | READ   | -",
        "notion__notion-update-page   | UPDATE | DOCUMENT",
        "notion__notion-create-pages  | CREATE | DOCUMENT",
        "notion__notion-get-comments  | READ   | COMMENT",
    })
    void a_first_word_that_repeats_the_connector_is_not_the_verb(String tool, Verb verb, String thing) {
        ToolChoice.Does does = ToolChoice.does(tool);

        assertThat(does.verbs()).containsExactly(verb);
        assertThat(does.thing()).isEqualTo(thing == null ? null : Thing.valueOf(thing));
    }

    @ParameterizedTest(name = "« {0} » écrit : {1}")
    @CsvSource(delimiter = '|', value = {
        // Relecture R159 (10) : l'écriture se lit sur le verbe d'action, jamais sur un mot isolé.
        "Qu'est-ce qui se passe dans Linear ?          | false",
        "Quels sont les nouveaux tickets dans Linear ? | false",
        "Montre-moi ce qui a été fait dans Linear      | false",
        "What's new in Linear?                         | false",
        "crée une tâche dans Linear                    | true",
    })
    void a_request_writes_by_its_action_verb(String request, boolean writes) {
        assertThat(ToolChoice.asked(request).writes()).isEqualTo(writes);
    }
}
