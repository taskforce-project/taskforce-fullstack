package com.taskforce.tf_api.core.service.agent;

import java.util.function.Consumer;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * Les étapes d'une réponse, poussées en direct à la personne qui l'attend : {@code /topic/cortex.{userId}}, un canal dont
 * la clé est l'identité de l'abonné, comme ses notifications. Chaque étape nomme sa conversation : une autre conversation
 * de la même personne, dans un autre onglet, ne les prend pas pour les siennes.
 */
@Component
@RequiredArgsConstructor
public class TurnProgressPublisher {

    /** Ce que reçoit la ligne de travail. */
    public record TurnStep(Long conversationId, String step, String tool) {}

    private final SimpMessagingTemplate messaging;

    /** Où vont les étapes de ce tour. */
    public Consumer<TurnProgress.Step> sinkFor(Long userId, Long conversationId) {
        String destination = "/topic/cortex." + userId;
        return step -> messaging.convertAndSend(destination, new TurnStep(conversationId, step.step(), step.tool()));
    }
}
