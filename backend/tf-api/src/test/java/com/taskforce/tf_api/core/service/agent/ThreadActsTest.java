package com.taskforce.tf_api.core.service.agent;

import java.util.List;
import java.util.function.Function;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.taskforce.tf_api.core.service.agent.CortexRecordService.Act;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * R204 : ce que Cortex a fait dans une conversation revient au modèle aux tours suivants. Les gestes viennent du dossier de
 * chaque réponse, accords et réponses donnés sur ses cartes après elle compris (s17, échanges 1 et 2).
 */
@DisplayName("Ce que la conversation a fait, pour le modèle (R204)")
class ThreadActsTest {

    private static final Function<String, String> WHERE = tool -> tool.startsWith("linear__") ? "Linear" : "TaskForce";

    /** L'échange 1 de s17 : TaskForce demande le nom, la personne répond sur la carte, le projet se crée dans TaskForce. */
    private static final List<Act> S17 = List.of(
        new Act("create_project", "{}", "question", "Nothing was done: TaskForce asks the person first. What should the project be called?",
            "h1", null),
        new Act("create_project", "{\"name\":\"Test Taskforce\",\"answered\":[\"name\"]}", "success",
            "Project created in TaskForce: TESTTASKFO \"Test Taskforce\" (id 12).", "h2", null));

    @Test
    @DisplayName("la question à laquelle la personne a répondu s'efface devant le geste fait ; le bloc dit l'outil, où, ses valeurs, son résultat")
    void the_block_says_what_was_done_and_where() {
        assertThat(ThreadActs.settled(S17)).extracting(Act::status).containsExactly("success");
        assertThat(ThreadActs.block(S17, WHERE)).isEqualTo(ThreadActs.HEADER
            + "\n- create_project, in TaskForce (name: Test Taskforce): done. Result: Project created in TaskForce: TESTTASKFO \"Test Taskforce\" (id 12).");
    }

    @Test
    @DisplayName("la réponse repart avec son texte, puis le bloc ; sans geste, telle quelle")
    void the_answer_carries_its_acts() {
        assertThat(ThreadActs.withActs("> [!taskforce] TaskForce · asks\n> What should the project be called?\n", S17, WHERE))
            .startsWith("> [!taskforce] TaskForce · asks\n> What should the project be called?\n\n" + ThreadActs.HEADER);
        assertThat(ThreadActs.withActs("Bonjour.", List.of(), WHERE)).isEqualTo("Bonjour.");
        assertThat(ThreadActs.withActs("", S17, WHERE)).startsWith(ThreadActs.HEADER);
    }

    @Test
    @DisplayName("ce qui attend encore la personne, ce qui a été refusé ou a échoué se dit comme pas fait")
    void what_waits_or_failed_is_said_not_done() {
        List<Act> acts = List.of(
            new Act("linear__save_issue", "{\"title\":\"Exemple\",\"team\":\"Core\"}", "pending", "Action proposed", "h1", null),
            new Act("delete_issue", "{\"issue\":\"TF-3\"}", "refused", "Not run: the rules refuse it.", "h2", null),
            new Act("add_comment", "{\"issue\":\"TF-4\",\"content\":\"a long text\"}", "error", "Tool add_comment failed: down", "h3", null));

        String block = ThreadActs.block(acts, WHERE);

        assertThat(block).contains("- linear__save_issue, in Linear (title: Exemple, team: Core): proposed on a card, waiting for the person's approval: not done")
            .contains("- delete_issue, in TaskForce (issue: TF-3): refused by the rules of this workspace: not done")
            .contains("- add_comment, in TaskForce (issue: TF-4): failed: not done")
            .doesNotContain("a long text");
    }

    @Test
    @DisplayName("ce qui a été fait reste fait, sauf ce que la personne a défait")
    void what_was_undone_is_not_done_anymore() {
        List<Act> acts = List.of(
            new Act("create_project", "{\"name\":\"A\"}", "success", "Project created in TaskForce: AAA \"A\" (id 1).", "h1", null),
            new Act("update_issue", "{\"issue\":\"TF-1\"}", "success", "TF-1 moved to Done.", "h2", null),
            new Act("create_project", "", "undone", "The project AAA was deleted.", "h3", "h1"));

        assertThat(ThreadActs.done(acts, WHERE)).containsExactly(
            new ActionClaimCheck.Done("update_issue", "TaskForce", "TF-1 moved to Done."));
        assertThat(ThreadActs.block(acts, WHERE)).contains("- create_project, in TaskForce: undone by the person");
    }

    @Test
    @DisplayName("les derniers gestes seulement, et des valeurs courtes : le bloc tient dans une petite fenêtre")
    void the_block_stays_short() {
        List<Act> many = java.util.stream.IntStream.range(0, 12)
            .mapToObj(i -> new Act("update_issue", "{\"issue\":\"TF-" + i + "\",\"title\":\"" + "x".repeat(100) + "\"}", "success",
                "y".repeat(400), "h" + i, null))
            .toList();

        String block = ThreadActs.block(many, WHERE);

        assertThat(block.lines().count()).isEqualTo(1 + ThreadActs.MAX_ACTS);
        assertThat(block).contains("issue: TF-11").doesNotContain("issue: TF-3,").contains("x".repeat(ThreadActs.MAX_VALUE) + "...");
        assertThat(block.lines().skip(1)).allSatisfy(line -> assertThat(line.length()).isLessThan(560));
    }
}
