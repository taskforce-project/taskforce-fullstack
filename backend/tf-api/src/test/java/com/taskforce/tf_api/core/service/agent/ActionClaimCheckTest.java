package com.taskforce.tf_api.core.service.agent;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.taskforce.tf_api.core.service.agent.ActionClaimCheck.Checked;
import com.taskforce.tf_api.core.service.agent.ActionClaimCheck.Done;
import com.taskforce.tf_api.core.service.agent.ActionClaimCheck.Kind;
import com.taskforce.tf_api.core.service.agent.ActionClaimCheck.Ran;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * R116 : une phrase qui annonce une action de TaskForce sans son résultat d'outil dans le tour est remplacée par la
 * vérité, signée par TaskForce. Les cas viennent de l'échange du 02/11/2026 (séance n°17) et de ce qu'un petit modèle
 * écrit d'ordinaire ; ceux qui n'annoncent rien comptent autant.
 */
@DisplayName("TaskForce dit ce qui a été fait (R116)")
class ActionClaimCheckTest {

    private static final Ran LIST = new Ran("list_issues", "success");

    /** « tool:status tool:status » ; vide, aucun outil dans le tour. */
    private static List<Ran> ran(String calls) {
        if (calls == null || calls.isBlank()) return List.of();
        return Arrays.stream(calls.trim().split("\\s+"))
            .map(call -> new Ran(call.substring(0, call.indexOf(':')), call.substring(call.indexOf(':') + 1)))
            .toList();
    }

    private static Set<Kind> kinds(String names) {
        Set<Kind> kinds = EnumSet.noneOf(Kind.class);
        if (names != null && !names.isBlank()) Arrays.stream(names.trim().split("\\s+")).forEach(n -> kinds.add(Kind.valueOf(n)));
        return kinds;
    }

    private static String block(String... truths) {
        return ActionClaimCheck.SIGNATURE + Arrays.stream(truths).map(t -> "\n> " + t).collect(Collectors.joining());
    }

    @ParameterizedTest(name = "« {0} » annonce : {1}")
    @CsvSource(delimiter = '|', value = {
        // L'échange 6 du 02/11/2026, puis ce qu'un petit modèle écrit d'ordinaire.
        "La carte TESTTA-2 a été supprimée du projet test-taskforce. | DELETE",
        "J'ai créé l'issue TESTTA-4.                                 | CREATE",
        "Je l'ai déplacée dans Done.                                 | MOVE",
        "Nous avons créé le projet.                                  | CREATE",
        "J'ai ajouté une note sur la version LTS.                    | CREATE",
        "I deleted TESTTA-2.                                         | DELETE",
        "I've created the issue.                                     | CREATE",
        "TESTTA-2 has been created.                                  | CREATE",
        "It's been moved to Done.                                    | MOVE",
        "The issues were deleted.                                    | DELETE",
        "TESTTA-2 is now assigned to Marie.                          | ASSIGN",
        "L'issue est maintenant assignée à Marie.                    | ASSIGN",
        "TESTTA-2 a été confiée à Claude Code.                       | DELEGATE",
        "La pull request a bien été fusionnée.                       | MERGE",
        "J'ai modifié la priorité de TESTTA-3.                       | UPDATE",
        "La carte a été mise à jour.                                 | UPDATE",
        // Le rejeu en vrai du 02/11/2026 : une issue « marquée » faite, avec list_issues pour seul outil.
        "TESTTA-1 was marked as Done.                                | UPDATE",
        "J'ai marqué TESTTA-2 comme faite.                           | UPDATE",
        "**Issue created**: Title Cortex test.                       | CREATE",
        "Issue créée : Test, dans TaskForce.                         | CREATE",
        "✅ Carte TESTTA-2 supprimée.                                | DELETE",
        "Done: TESTTA-2 deleted.                                     | DELETE",
        "Pas de souci, j'ai supprimé la carte.                       | DELETE",
        "C'est fait : la carte est maintenant déplacée dans Done.    | MOVE",
        "J'ai créé TESTTA-4 puis supprimé TESTTA-2.                  | CREATE DELETE",
        "I deleted TESTTA-2 and created TESTTA-4.                    | CREATE DELETE",
        "Cette semaine, la carte TESTTA-2 a été supprimée.           | DELETE",
        "La carte a été supprimée par Cortex.                        | DELETE",
        "TESTTA-2 a été déplacée dans In review by AI.               | MOVE",
        // Ce que qwen3:8b a écrit en rejouant les six échanges, le 02/11/2026, sur le backend de la branche.
        "L'issue TESTTA-2 a été supprimée et une carte de suppression a été préparée pour validation. | DELETE",
        "J'ai créé une note intitulée **\"Ajouter la version LTS\"** dans le domaine **PRODUIT**. | CREATE",
        "La note « Ajouter la version LTS » a été créée dans le domaine PROJET. | CREATE",
        // Ce qui n'annonce rien : une proposition, une question, une négation, un futur.
        "La carte est prête à être créée.                            | ",
        "Je peux la supprimer si tu veux.                            | ",
        "Veux-tu que je supprime TESTTA-2 ?                          | ",
        "Has TESTTA-2 been deleted?                                  | ",
        "Rien n'a été supprimé.                                      | ",
        "L'issue TESTTA-2 n'a pas été supprimée.                     | ",
        "Aucune carte n'a été créée.                                 | ",
        "No issue was created.                                       | ",
        "Nothing was deleted in this turn.                           | ",
        "I haven't deleted anything.                                 | ",
        "I did not delete TESTTA-2.                                  | ",
        "Une fois validée, la carte sera créée.                      | ",
        "Once you approve it, the issue will be created.             | ",
        "I can delete it if you want.                                | ",
        "The card is ready to be created.                            | ",
        "Je n'ai pas d'outil pour supprimer une issue.               | ",
        // L'action d'un autre, un passé daté, un objet décrit, un état.
        "TESTTA-2 a été déplacée dans In review by AI par Claude Code. | ",
        "TESTTA-3 was moved to Done by Alice.                        | ",
        "Issue TF-12 was created on Monday.                          | ",
        "Hier, la carte TESTTA-1 a été créée.                        | ",
        "Le 01/11, TESTTA-1 a été créée.                             | ",
        "Here are the issues that were created this week: TF-12.     | ",
        "Les issues qui ont été créées cette semaine : TF-12.        | ",
        "You added a note about the release.                         | ",
        "Tu as supprimé la carte toi-même.                           | ",
        "TESTTA-2 est assignée à Pierre.                             | ",
        "TESTTA-2 is assigned to Pierre.                             | ",
        "TESTTA-2 est dans la colonne In review by AI.               | ",
        "3 issues opened this week: TF-1, TF-2.                      | ",
        "Open the board and click New issue.                         | ",
        // La réponse elle-même, une carte préparée, un titre cité.
        "I have created a plan: first, the board.                    | ",
        "J'ai préparé une carte : vérifie-la puis crée-la.           | ",
        "J'ai préparé la carte « Supprimer l'issue TESTTA-2 ».       | ",
        // Ce que qwen3:8b a écrit d'honnête dans le même rejeu : rien à corriger.
        "La carte pour supprimer l'issue TESTTA-2 est prête à être revue. | ",
        "L'issue « Corriger le footer » est prête à être revue et créée dans le projet test-taskforce. | ",
        "La note « Ajouter la version LTS » a été trouvée dans le domaine PROJET. | ",
        "I cannot delete issues directly.                            | ",
        "I can help you mark TESTTA-2 as a duplicate of TESTTA-1.    | ",
    })
    void reads_what_a_sentence_claims(String sentence, String expected) {
        assertThat(ActionClaimCheck.claimedKinds(sentence)).isEqualTo(kinds(expected));
    }

    @ParameterizedTest(name = "{1} : « {0} » remplacée {2}")
    @CsvSource(delimiter = '|', value = {
        "La carte TESTTA-2 a été supprimée du projet test-taskforce. | list_issues:success        | true",
        "Project created: CORTEX Cortex test.                        | create_project:success     | false",
        "J'ai déplacé TESTTA-2 dans Done.                            | move_issue:success         | false",
        "I assigned TESTTA-2 to Marie.                               | update_issue:success       | false",
        "Issue created in Linear.                                    | linear__save_issue:success | false",
        "I created TESTTA-4 and assigned it to Marie.                | create_issue:success       | false",
        "I created TESTTA-4 and deleted TESTTA-2.                    | create_issue:success       | true",
        "J'ai supprimé TESTTA-2.                                     | delete_issue:error         | true",
        "Issue created: Pricing page.                                | create_issue:pending       | true",
    })
    void only_a_successful_tool_of_the_same_kind_backs_a_claim(String answer, String calls, boolean corrected) {
        assertThat(ActionClaimCheck.check(answer, ran(calls)).corrected()).isEqualTo(corrected);
    }

    @ParameterizedTest(name = "{1} : {2}")
    @CsvSource(delimiter = '|', value = {
        "La carte TESTTA-2 a été supprimée.  | list_issues:success        | Nothing was deleted in this turn.",
        "Issue created: Pricing page.        | create_issue:pending       | Nothing is created yet: check the issue below, then create it.",
        "Issue created in Linear.            | linear__save_issue:pending | Nothing is created yet: the action below waits for your approval.",
        "J'ai créé l'issue.                  | create_issue:question      | Nothing is created yet: Cortex needs an answer from you first.",
        "I created the project.              | create_project:refused     | Nothing was created: the rules of this workspace refuse this action.",
        "I added a note.                     | create_note:error          | Nothing was created: the action failed.",
        "I deleted TESTTA-2 and created TESTTA-4. |                       | Nothing was created or deleted in this turn.",
    })
    void the_truth_comes_from_what_the_tools_of_the_turn_did(String answer, String calls, String truth) {
        Checked checked = ActionClaimCheck.check(answer, ran(calls));

        assertThat(checked.truths()).containsExactly(truth);
        assertThat(checked.answer()).isEqualTo(block(truth));
    }

    @Test
    @DisplayName("la vérité prend la place de la phrase fausse ; le reste de la réponse ne bouge pas")
    void the_truth_takes_the_place_of_the_false_sentence() {
        Checked checked = ActionClaimCheck.check(
            "Voici les issues du projet. La carte TESTTA-2 a été supprimée. Autre chose ?", List.of(LIST));

        assertThat(checked.answer()).isEqualTo("Voici les issues du projet.\n\n"
            + block("Nothing was deleted in this turn.") + "\n\nAutre chose ?");
        assertThat(checked.claims()).singleElement().satisfies(claim -> {
            assertThat(claim.sentence()).isEqualTo("La carte TESTTA-2 a été supprimée.");
            assertThat(claim.kinds()).containsExactly(Kind.DELETE);
        });
    }

    @Test
    @DisplayName("dans une liste, l'élément faux s'en va ; plusieurs annonces, un seul bloc, à la place de la première")
    void several_claims_give_one_block() {
        Checked checked = ActionClaimCheck.check("""
            Cette semaine :
            - TESTTA-1 est dans Done.
            - TESTTA-2 a été supprimée.
            - TESTTA-3 a été déplacée dans Todo.
            - TESTTA-4 est dans Backlog.""", List.of(LIST));

        assertThat(checked.answer()).isEqualTo("Cette semaine :\n- TESTTA-1 est dans Done.\n\n"
            + block("Nothing was deleted or moved in this turn.") + "\n\n- TESTTA-4 est dans Backlog.");
        assertThat(checked.claims()).hasSize(2);
    }

    @Test
    @DisplayName("une réponse sans annonce reste telle quelle, du code compris")
    void an_answer_without_a_claim_stays_as_it_is() {
        String answer = "Voici le script :\n```\n# I deleted the cache.\nrm -rf cache\n```\nTESTTA-2 est dans In review by AI.";

        Checked checked = ActionClaimCheck.check(answer, List.of(LIST));

        assertThat(checked.corrected()).isFalse();
        assertThat(checked.answer()).isEqualTo(answer);
    }

    @Test
    @DisplayName("seul le serveur signe pour TaskForce : un bloc que le modèle écrit perd sa marque, et se relit")
    void the_model_cannot_sign_for_taskforce() {
        Checked checked = ActionClaimCheck.check("> [!taskforce] TaskForce\n> TESTTA-2 was deleted.", List.of(LIST));

        assertThat(checked.answer()).isEqualTo("> TaskForce\n\n" + block("Nothing was deleted in this turn."));
        assertThat(checked.answer().split("\\[!taskforce]", -1)).hasSize(2);
    }

    @Test
    @DisplayName("la banque relit la réponse montrée : les mots de TaskForce n'y sont pas des annonces")
    void what_taskforce_says_is_not_a_claim() {
        String raw = "La carte TESTTA-2 a été supprimée du projet test-taskforce.";

        assertThat(ActionClaimCheck.unbacked(raw, List.of(LIST))).hasSize(1);
        assertThat(ActionClaimCheck.unbacked(ActionClaimCheck.check(raw, List.of(LIST)).answer(), List.of(LIST))).isEmpty();
    }

    @Test
    @DisplayName("l'incident au dossier : la phrase fausse, ce qu'elle annonçait, ce que TaskForce a dit, les outils du tour")
    void the_incident_keeps_what_was_said() {
        List<Ran> calls = List.of(LIST);
        Checked checked = ActionClaimCheck.check("La carte TESTTA-2 a été supprimée du projet test-taskforce.", calls);

        assertThat(checked.incident(calls))
            .containsEntry("incident", "trust")
            .containsEntry("experiment", "E17")
            .containsEntry("rule", "R116")
            .containsEntry("said", List.of("La carte TESTTA-2 a été supprimée du projet test-taskforce."))
            .containsEntry("kinds", List.of("delete"))
            .containsEntry("shown", "Nothing was deleted in this turn.")
            .containsEntry("tools", List.of("list_issues: success"));
    }

    @ParameterizedTest(name = "{0} : {1}")
    @CsvSource(delimiter = '|', value = {
        "create_issue                | CREATE",
        "create_note                 | CREATE",
        "linear__save_issue          | CREATE UPDATE",
        "delete_issue                | DELETE",
        "update_issue                | UPDATE",
        "move_issue                  | MOVE",
        "assign_issue                | ASSIGN",
        "delegate_issue              | DELEGATE",
        "github__merge_pull_request  | MERGE",
        "github__add_issue_comment   | CREATE",
        "linear__createIssue         | CREATE",
        "linear__getIssue            | ",
        "list_issues                 | ",
        "search_brain                | ",
        "find_integration            | ",
    })
    void what_a_tool_does_comes_from_its_name(String tool, String expected) {
        assertThat(ActionClaimCheck.kindsOf(tool)).isEqualTo(kinds(expected));
    }

    // -------------------------------------------------------------------------
    // R204 : ce que la conversation a fait, Cortex ne le nie pas (recette de la 1.17.0, 17/11/2026)
    // -------------------------------------------------------------------------

    /** Le projet que Cortex a créé dans TaskForce, sur la carte de sa question, au tour d'avant (s17, échange 1). */
    private static final Done CREATED = new Done("create_project", "TaskForce",
        "Project created in TaskForce: TESTTASKFO \"Test Taskforce\" (id 12).");
    private static final Set<String> SYSTEMS = Set.of("TaskForce", "Linear");

    @ParameterizedTest(name = "« {0} » nie le projet créé : {1}")
    @CsvSource(delimiter = '|', value = {
        // L'échange 2 de s17, puis ce qu'un petit modèle écrit d'ordinaire.
        "Je n'ai pas créé de projet, car vous ne m'avez pas donné de nom. | true",
        "Je n'ai pas encore créé de projet faute de nom.                  | true",
        "Je ne l'ai pas créé.                                             | true",
        "Je n'ai créé aucun projet.                                       | true",
        "Aucun projet n'a été créé.                                       | true",
        "Le projet n'a pas encore été créé.                               | true",
        "Je n'ai pas pu créer le projet.                                  | true",
        "I didn't create the project because you gave no name.           | true",
        "I haven't created any project yet.                               | true",
        "No project was created.                                          | true",
        "The project was not created.                                     | true",
        "Nothing has been created.                                        | true",
        // Ce qui ne nie pas le projet créé dans TaskForce : un autre système, une autre chose, une condition, un fait.
        "Je ne l'ai pas créé dans Linear : il est dans TaskForce.         | false",
        "I didn't create it in Linear, only in TaskForce.                 | false",
        "Je n'ai pas créé de tâche.                                       | false",
        "Je n'ai pas créé d'autre projet.                                 | false",
        "Je n'ai pas supprimé le projet.                                  | false",
        "Si je ne l'ai pas créé, dis-le moi.                              | false",
        "Je l'ai créé dans TaskForce : TESTTASKFO.                        | false",
        "Je ne peux pas créer de projet dans Linear.                      | false",
        "Je n'ai pas d'outil pour créer des tâches dans Linear.           | false",
        "Je n'ai créé que le projet TESTTASKFO.                           | false",
        "Le projet n'a pas été créé hier.                                 | false",
        "Has the project been created?                                    | false",
    })
    void a_sentence_that_denies_what_the_conversation_did(String sentence, boolean denies) {
        Checked checked = ActionClaimCheck.check(sentence, List.of(), List.of(CREATED), SYSTEMS);

        assertThat(checked.denied()).isEqualTo(denies);
        assertThat(checked.corrected()).isEqualTo(denies);
    }

    @Test
    @DisplayName("R204 : la phrase qui nie s'en va, et TaskForce dit ce qui a été fait, et où, sous sa signature")
    void the_truth_of_what_was_done_takes_its_place() {
        Checked checked = ActionClaimCheck.check(
            "Je n'ai pas créé de projet, car vous ne m'avez pas donné de nom. Quel nom voulez-vous ?", List.of(),
            List.of(CREATED), SYSTEMS);

        assertThat(checked.answer()).isEqualTo(ActionClaimCheck.DONE_SIGNATURE
            + "\n> This was created in this conversation, in TaskForce: Project created: TESTTASKFO \"Test Taskforce\"."
            + "\n\nQuel nom voulez-vous ?");
        assertThat(checked.denials()).singleElement()
            .satisfies(denial -> assertThat(denial.sentence()).startsWith("Je n'ai pas créé de projet"));
        assertThat(checked.claims()).isEmpty();
        assertThat(checked.incident(List.of()))
            .containsEntry("rule", "R204")
            .containsEntry("denied", List.of("Je n'ai pas créé de projet, car vous ne m'avez pas donné de nom."))
            .containsEntry("kinds", List.of("create"));
    }

    @Test
    @DisplayName("R204 : dire fait ce que la conversation a fait dit vrai, dans le système où elle l'a fait")
    void saying_done_what_an_earlier_turn_did_is_true() {
        assertThat(ActionClaimCheck.check("J'ai créé le projet TESTTASKFO dans TaskForce, pas dans Linear.", List.of(),
            List.of(CREATED), SYSTEMS).corrected()).isFalse();
        assertThat(ActionClaimCheck.check("Le projet a été créé.", List.of(), List.of(CREATED), SYSTEMS).corrected()).isFalse();
        // Un autre système, une autre chose : rien de la conversation ne l'appuie.
        assertThat(ActionClaimCheck.check("J'ai créé le projet dans Linear.", List.of(), List.of(CREATED), SYSTEMS).claims())
            .hasSize(1);
        assertThat(ActionClaimCheck.check("J'ai créé la tâche.", List.of(), List.of(CREATED), SYSTEMS).claims()).hasSize(1);
        // Sans la conversation, la même phrase reste une annonce sans résultat (R116).
        assertThat(ActionClaimCheck.check("Le projet a été créé.", List.of()).claims()).hasSize(1);
    }

    @Test
    @DisplayName("R204 : la carte du tour qui attend la personne est ce dont parle « pas encore créé » ; rien de fait n'est nié")
    void not_yet_speaks_of_the_card_of_the_turn() {
        Checked checked = ActionClaimCheck.check("Je n'ai pas encore créé le projet : dis-moi son nom.",
            List.of(new Ran("create_project", "question")), List.of(CREATED), SYSTEMS);

        assertThat(checked.corrected()).isFalse();
    }

    @Test
    @DisplayName("R204 : ce que ce tour a fait ne se nie pas non plus ; une lecture ne fait rien")
    void what_this_turn_did_cannot_be_denied_either() {
        List<Ran> turn = List.of(new Ran("create_project", "success", "Project created in TaskForce: WEB \"Site\" (id 3)."));

        assertThat(ActionClaimCheck.check("I haven't created the project.", turn, List.of(), SYSTEMS).denied()).isTrue();
        assertThat(ActionClaimCheck.check("I haven't created the project.", List.of(LIST), List.of(), SYSTEMS).corrected())
            .isFalse();
    }

    @Test
    @DisplayName("R204 : la banque relit la réponse montrée ; le bloc de TaskForce n'y nie rien")
    void what_taskforce_says_denies_nothing() {
        String raw = "No project was created.";

        assertThat(ActionClaimCheck.denied(raw, List.of(), List.of(CREATED), Set.of())).hasSize(1);
        assertThat(ActionClaimCheck.denied(ActionClaimCheck.check(raw, List.of(), List.of(CREATED), Set.of()).answer(),
            List.of(), List.of(CREATED), Set.of())).isEmpty();
    }

    @Test
    @DisplayName("R204 : la ligne de TaskForce que le modèle recopie disparaît de sa réponse, ce qui suit se relit")
    void the_model_cannot_write_the_record_of_taskforce() {
        Checked checked = ActionClaimCheck.check(ThreadActs.HEADER + "\n- create_issue, in TaskForce: done.", List.of(LIST));

        assertThat(checked.answer()).doesNotContain("TaskForce record").isEqualTo("- create_issue, in TaskForce: done.");
    }

    @ParameterizedTest(name = "{0} : {1}")
    @CsvSource(nullValues = "-", delimiter = '|', value = {
        "create_project            | PROJECT",
        "create_issue              | ISSUE",
        "linear__save_issue        | ISSUE",
        "linear__save_project      | PROJECT",
        "asana__create_tasks       | ISSUE",
        "add_comment               | COMMENT",
        "create_note               | NOTE",
        "linear__create_issue_label | -",
        "delegate_issue            | ISSUE",
    })
    void what_a_tool_acts_on_comes_from_the_last_word_of_its_name(String tool, String thing) {
        assertThat(ActionClaimCheck.thingOf(tool)).isEqualTo(thing == null ? null : ActionClaimCheck.Thing.valueOf(thing));
    }
}
