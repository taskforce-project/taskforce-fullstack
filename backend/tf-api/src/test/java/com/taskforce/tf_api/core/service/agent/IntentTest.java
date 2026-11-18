package com.taskforce.tf_api.core.service.agent;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Ce qu'une demande veut faire, lu sur ses verbes (R204, relecture R159 de la PR #548) : l'intention d'écrire tient au
 * verbe d'action, jamais à un mot isolé.
 */
@DisplayName("Ce qu'une demande veut faire (R159)")
class IntentTest {

    @ParameterizedTest(name = "« {0} » écrit : {1}")
    @CsvSource(delimiter = '|', value = {
        "crée une tâche dans Linear                          | true",
        "Tu peux me creer un nouveau projet dans Linear ?    | true",
        "passe TF-12 en Done                                 | true",
        "Résume TF-21 et poste-le sur Slack                  | true",
        "Create an issue in Linear                           | true",
        "please post it on Slack                             | true",
        "Peux-tu l'archiver ?                                | true",
        "Merci de créer le projet                            | true",
        // Un mot isolé n'écrit rien : un pronominal, un adjectif, un passé, un nom.
        "Qu'est-ce qui se passe dans Linear ?                | false",
        "Quels sont les nouveaux tickets dans Linear ?       | false",
        "Montre-moi ce qui a été fait dans Linear            | false",
        "What's new in Linear?                               | false",
        "Tu l'as creer ou ?                                  | false",
        "It was set to Done yesterday                        | false",
        "Open the PDF file attached to the post              | false",
        "Is there any change on the board?                   | false",
        "C'est mergé sur GitHub                              | false",
    })
    void a_request_writes_by_its_action_verb(String request, boolean writes) {
        assertThat(Intent.writes(request)).isEqualTo(writes);
    }

    @Test
    @DisplayName("une proposition sans verbe complète celle d'avant, ou ouvre la suivante ; un constat ne fait rien")
    void a_piece_without_a_verb_belongs_to_a_clause() {
        assertThat(Intent.clauses("crée une issue pour le login et le paiement dans Linear"))
            .singleElement().satisfies(clause -> {
                assertThat(clause.does()).isEqualTo(Intent.Does.WRITE);
                assertThat(clause.text()).contains("dans Linear");
            });
        assertThat(Intent.clauses("Dans Linear, crée une tâche")).singleElement()
            .satisfies(clause -> assertThat(clause.text()).startsWith("Dans Linear"));
        assertThat(Intent.clauses("C'est mergé sur GitHub, passe TF-12 en Done")).extracting(Intent.Clause::does)
            .containsExactly(Intent.Does.NOTHING, Intent.Does.WRITE);
    }

    @Test
    @DisplayName("un participe après une écriture décrit ce qu'elle écrit ; en tête de demande, c'est un constat")
    void a_participle_after_a_write_describes_its_object() {
        assertThat(Intent.clauses("Crée une issue, assignée à Marie, dans Linear")).singleElement().satisfies(clause -> {
            assertThat(clause.does()).isEqualTo(Intent.Does.WRITE);
            assertThat(clause.text()).contains("dans Linear");
        });
        assertThat(Intent.clauses("Merged on GitHub, move TF-12 to Done")).extracting(Intent.Clause::does)
            .containsExactly(Intent.Does.NOTHING, Intent.Does.WRITE);
    }

    @Test
    @DisplayName("R159, second tour : le verbe de chaque proposition qui écrit dit ce que la demande en cours demande")
    void the_write_verbs_say_what_the_request_asks() {
        assertThat(Intent.writeVerbs("Crée une issue pour le bug du paiement et assigne-la à Marie"))
            .containsExactly("cree", "assigne");
        assertThat(Intent.writeVerbs("C'est mergé sur GitHub, passe TF-12 en Done")).containsExactly("passe");
        assertThat(Intent.writeVerbs("Tu l'as creer ou ? Je le vois pas dans linear")).isEmpty();
    }

    @ParameterizedTest(name = "« {0} » en demande une de plus : {1}")
    @CsvSource(delimiter = '|', value = {
        "Et un autre projet ?                       | true",
        "Un nouveau projet, stp                     | true",
        "Quels sont les nouveaux projets ?          | false",
        "Montre-moi les nouveaux projets            | false",
        "Merci !                                    | false",
    })
    void a_request_without_a_verb_may_ask_for_one_more(String request, boolean more) {
        assertThat(Intent.asksForMore(request)).isEqualTo(more);
    }

    @ParameterizedTest(name = "« {0} » écrit : {1}")
    @CsvSource(delimiter = '|', value = {
        // Second tour de la relecture R159 (D) : un mot interrogatif en tête n'écrit pas ; « comment » n'écrit qu'avec « on ».
        "Comment avance le projet dans Linear ?          | false",
        "Comment ça se passe dans Linear ?               | false",
        "Quel poste occupe Marie dans Linear ?           | false",
        "Comment on fait pour créer une issue ?          | false",
        "How do I create an issue in Linear?             | false",
        "Dis-moi quel poste occupe Marie                 | false",
        "Comment on TF-12: the fix is merged             | true",
        "Can you comment on TF-12?                       | true",
        "Commente TF-12 : c'est corrigé                  | true",
        "Poste le résumé sur Slack                       | true",
    })
    void a_question_word_at_the_head_writes_nothing(String request, boolean writes) {
        assertThat(Intent.writes(request)).isEqualTo(writes);
    }

    @ParameterizedTest(name = "« {0} » écrit : {1}")
    @CsvSource(delimiter = '|', value = {
        // Troisième tour de la relecture R159 (N1) : une question sur le passé ne demande pas d'écrire, même avec un
        // adverbe, une négation ou « did » entre l'auxiliaire et le verbe.
        "Tu l'as bien créé ? Je le vois pas dans Linear       | false",
        "Tu ne l'as pas créé ?                                | false",
        "T'as vraiment créé le projet ?                       | false",
        "As-tu créé le projet ?                               | false",
        "Did you create the project? I don't see it in Linear | false",
        "Did you really create it?                            | false",
        "Didn't you create the issue in Linear?               | false",
        // Ses voisins : une demande, polie ou non, écrit.
        "Peux-tu bien créer le projet ?                       | true",
        "Merci de bien créer le projet                        | true",
        "Can you create the project in Linear?                | true",
        "Tu crées le projet Marketing ?                       | true",
    })
    void a_question_about_the_past_writes_nothing(String request, boolean writes) {
        assertThat(Intent.writes(request)).isEqualTo(writes);
    }

    @Test
    @DisplayName("R159, troisième tour (N1) : une question au participe ne demande pas d'écrire ; « le nouveau » n'en demande pas un autre")
    void a_question_with_a_participle_asks_nothing() {
        assertThat(Intent.writeVerbs("Tu peux me creer un nouveau projet dans Linear la ou pas ?")).containsExactly("creer");
        assertThat(Intent.writeVerbs("Est-ce que tu peux créer le projet ?")).containsExactly("creer");
        assertThat(Intent.writeVerbs("Tu crées le projet Marketing ?")).containsExactly("crees");
        assertThat(Intent.writeVerbs("Le projet, créé ou pas ?")).isEmpty();
        assertThat(Intent.writeVerbs("Créé ou pas ?")).isEmpty();
        assertThat(Intent.asksForMore("Et le nouveau projet ?")).isFalse();
        assertThat(Intent.asksForMore("Et l'autre projet ?")).isFalse();
        assertThat(Intent.asksForMore("Et un nouveau projet ?")).isTrue();
        assertThat(Intent.asksForMore("Un autre ?")).isTrue();
    }

    @ParameterizedTest(name = "« {0} » écrit : {1}")
    @CsvSource(delimiter = '|', value = {
        // Quatrième tour de la relecture R159 (B1) : la question de la recette tapée vite (« la » pour « l'as ») ne demande
        // rien ; l'infinitif ou le verbe sans la marque de « tu » y tient lieu de participe.
        "Tu la creer ou ? Je le vois pas dans linear    | false",
        "Tu le creer ou pas ?                           | false",
        "Tu la créer ou pas ?                           | false",
        "Tu les creer ?                                 | false",
        "Tu me la creer ?                               | false",
        "Vous le creer ou pas ?                         | false",
        "Tu la cree ?                                   | false",
        "Tu la créé ?                                   | false",
        "Tu l'a creer ?                                 | false",
        "Vous l'avez creer ?                            | false",
        // (B2) : une demande posée en question reste une demande, quoi qu'il y ait devant son verbe.
        "Tu la crées ?                                  | true",
        "Tu peux la créer ?                             | true",
        "On crée aussi le projet Marketing ?            | true",
        "Tu peux juste créer le projet Marketing ?      | true",
        "Du coup tu crées le projet Marketing ?         | true",
        "Tu vas créer le projet ?                       | true",
        "Tu ne crées pas le projet Marketing ?          | true",
        "Can we create the Marketing project?           | true",
        "Could you just create the Marketing project?   | true",
        "On crée une issue pour le bug du paiement ?    | true",
        // Les voisins de N1 restent des questions.
        "Tu l'as bien créé ? Je le vois pas dans Linear | false",
        "Tu ne l'as pas créé ?                          | false",
        "As-tu créé le projet ?                         | false",
        "Did you really create it?                      | false",
        "Le projet, créé ou pas ?                       | false",
        "Créé ou pas ?                                  | false",
    })
    void a_question_asks_to_write_unless_its_verb_tells_the_past(String request, boolean writes) {
        assertThat(Intent.writes(request)).isEqualTo(writes);
        assertThat(Intent.writeVerbs(request).isEmpty()).isEqualTo(!writes);
    }
}
