package com.taskforce.tf_api.core.service;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.taskforce.tf_api.core.dto.response.IssueRealtimeEvent;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Le topic d'un projet ({@code /topic/projects.{id}}), pour ce qui change sans être une issue : l'objectif du projet, les
 * documents d'une issue (la vue du workflow, lot W1). L'annonce part après le commit, sans rien de ce qui a changé : l'écran
 * relit ce qu'il montre, avec les droits de la personne qui lit. Elle ne fait jamais échouer le geste.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ProjectTopic {

    /** L'objectif du projet a été posé, changé ou retiré. */
    public static final String OBJECTIVE_CHANGED = "objective.changed";

    /** Une pièce jointe d'une issue du projet a été ajoutée ou retirée : le nombre de ses documents a changé. */
    public static final String ATTACHMENTS_CHANGED = "attachments.changed";

    private final SimpMessagingTemplate messagingTemplate;

    /** Annonce après le commit de la transaction en cours (hors transaction, tout de suite) ; {@code issueId} peut être nul. */
    public void announce(String action, Long projectId, Long issueId) {
        Runnable send = () -> {
            try {
                messagingTemplate.convertAndSend("/topic/projects." + projectId, IssueRealtimeEvent.builder()
                    .action(action)
                    .projectId(projectId)
                    .issueId(issueId)
                    .build());
            } catch (Exception ex) {
                log.warn("Annonce temps réel {} échouée (projet {}): {}", action, projectId, ex.getMessage());
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send.run();
                }
            });
        } else {
            send.run();
        }
    }
}
