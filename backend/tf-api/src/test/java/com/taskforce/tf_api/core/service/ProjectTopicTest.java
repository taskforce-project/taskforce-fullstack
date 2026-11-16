package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.taskforce.tf_api.core.dto.response.IssueRealtimeEvent;

/** Le topic d'un projet pour ce qui change sans être une issue (lot W1, R159 L7) : une annonce sans contenu, après le commit. */
class ProjectTopicTest {

    private final SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
    private final ProjectTopic topic = new ProjectTopic(template);

    @AfterEach
    void clear() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    @DisplayName("hors transaction : l'annonce part tout de suite, sur le topic du projet, sans rien de ce qui a changé")
    void announces_on_the_project_topic() {
        topic.announce(ProjectTopic.ATTACHMENTS_CHANGED, 12L, 40L);

        ArgumentCaptor<IssueRealtimeEvent> event = ArgumentCaptor.forClass(IssueRealtimeEvent.class);
        verify(template).convertAndSend(eq("/topic/projects.12"), event.capture());
        assertThat(event.getValue().getAction()).isEqualTo("attachments.changed");
        assertThat(event.getValue().getProjectId()).isEqualTo(12L);
        assertThat(event.getValue().getIssueId()).isEqualTo(40L);
        assertThat(event.getValue().getIssue()).isNull();
        assertThat(event.getValue().getRelation()).isNull();
    }

    @Test
    @DisplayName("dans une transaction : rien avant le commit, l'annonce après")
    void waits_for_the_commit() {
        TransactionSynchronizationManager.initSynchronization();
        topic.announce(ProjectTopic.OBJECTIVE_CHANGED, 12L, null);
        verify(template, never()).convertAndSend(any(String.class), any(Object.class));

        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
        verify(template).convertAndSend(eq("/topic/projects.12"), any(IssueRealtimeEvent.class));
    }

    @Test
    @DisplayName("une annonce qui échoue ne fait pas échouer le geste")
    void a_failed_announce_never_fails_the_gesture() {
        doThrow(new IllegalStateException("broker down")).when(template).convertAndSend(any(String.class), any(Object.class));
        assertThatCode(() -> topic.announce(ProjectTopic.OBJECTIVE_CHANGED, 12L, null)).doesNotThrowAnyException();
    }
}
