package com.taskforce.tf_api.core.service.agent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

@DisplayName("TurnProgress : ce que Cortex fait, annoncé au moment où il le fait (R137)")
class TurnProgressTest {

    @Test
    @DisplayName("les étapes vont à celui qui les attend, le temps de l'action et dans ce fil")
    void steps_go_to_the_sink_during_the_action() {
        List<TurnProgress.Step> seen = new ArrayList<>();

        String result = TurnProgress.during(seen::add, () -> {
            TurnProgress.say(TurnProgress.NOTES);
            TurnProgress.tool("create_issue");
            return "done";
        });
        TurnProgress.say(TurnProgress.WRITING); // hors de l'action : personne n'écoute

        assertThat(result).isEqualTo("done");
        assertThat(seen).containsExactly(new TurnProgress.Step(TurnProgress.NOTES, null), new TurnProgress.Step(TurnProgress.TOOL, "create_issue"));
    }

    @Test
    @DisplayName("sans destinataire, rien n'est annoncé ; une annonce qui échoue ne touche pas la réponse")
    void an_announcement_never_breaks_the_answer() {
        assertThat(TurnProgress.<String>during(null, () -> "done")).isEqualTo("done");

        assertThat(TurnProgress.<String>during(step -> { throw new IllegalStateException("broker down"); }, () -> {
            TurnProgress.say(TurnProgress.NOTES);
            return "still done";
        })).isEqualTo("still done");
    }

    @Test
    @DisplayName("deux actions imbriquées : l'extérieure retrouve son destinataire")
    void nesting_restores_the_outer_sink() {
        List<TurnProgress.Step> outer = new ArrayList<>();
        List<TurnProgress.Step> inner = new ArrayList<>();

        TurnProgress.during(outer::add, () -> {
            TurnProgress.during(inner::add, () -> {
                TurnProgress.say(TurnProgress.THINKING);
                return null;
            });
            TurnProgress.say(TurnProgress.WRITING);
            return null;
        });

        assertThat(inner).containsExactly(new TurnProgress.Step(TurnProgress.THINKING, null));
        assertThat(outer).containsExactly(new TurnProgress.Step(TurnProgress.WRITING, null));
    }

    @Test
    @DisplayName("les étapes partent sur le canal de la personne, avec leur conversation")
    void steps_are_published_on_the_person_s_channel() {
        SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
        TurnProgressPublisher publisher = new TurnProgressPublisher(messaging);

        publisher.sinkFor(7L, 42L).accept(new TurnProgress.Step(TurnProgress.TOOL, "create_issue"));

        verify(messaging).convertAndSend(eq("/topic/cortex.7"), eq((Object) new TurnProgressPublisher.TurnStep(42L, TurnProgress.TOOL, "create_issue")));
        verify(messaging, never()).convertAndSend(eq("/topic/cortex.8"), any(Object.class));
    }
}
