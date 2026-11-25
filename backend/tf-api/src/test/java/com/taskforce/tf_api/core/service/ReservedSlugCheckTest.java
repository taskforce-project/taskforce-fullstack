package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

/**
 * R159 de #551, troisième tour, c-e : la réserve du slug {@code verify} ne valait que pour une adresse posée désormais ; un
 * espace existant de ce nom, qu'aucune migration ne cherche, serait masqué par la page {@code /verify/<id>}.
 */
@DisplayName("Au démarrage, un espace à une adresse réservée se dit au journal (R159 de #551, troisième tour, c-e)")
class ReservedSlugCheckTest {

    @Test
    @DisplayName("un espace existant nommé verify : une alerte, avec son id, jamais son nom")
    void a_workspace_at_a_reserved_address_is_logged_by_its_id() {
        WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
        when(workspaces.findBySlug(anyString())).thenReturn(Optional.empty());
        when(workspaces.findBySlug("verify")).thenReturn(Optional.of(Workspace.builder().id(42L).name("Acme Verify Team")
            .slug("verify").build()));
        Logger logger = (Logger) LoggerFactory.getLogger(ReservedSlugCheck.class);
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
        try {
            assertThat(new ReservedSlugCheck(workspaces).check()).containsExactly(42L);

            assertThat(logs.list).singleElement().satisfies(line -> {
                assertThat(line.getLevel()).isEqualTo(Level.WARN);
                assertThat(line.getFormattedMessage()).contains("42").contains("/verify").doesNotContain("Acme");
            });
        } finally {
            logger.detachAppender(logs);
        }
    }

    @Test
    @DisplayName("aucun espace à une adresse réservée : rien au journal")
    void nothing_to_say_says_nothing() {
        WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
        when(workspaces.findBySlug(anyString())).thenReturn(Optional.empty());

        assertThat(new ReservedSlugCheck(workspaces).check()).isEmpty();
    }
}
