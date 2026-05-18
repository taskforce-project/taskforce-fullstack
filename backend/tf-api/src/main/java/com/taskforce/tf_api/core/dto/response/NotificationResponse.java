package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Représentation d'une notification pour l'inbox de l'utilisateur. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationResponse {

    private Long id;

    /** mention | assigned | commented | statusChanged | dueSoon | overdue | completed */
    private String type;

    /** critical | warning | info | low */
    private String urgency;

    private boolean read;
    private boolean acknowledged;

    /** Auteur de l'action (null pour les alertes système) */
    private ActorSummary actor;

    /** Titre de la notification */
    private String title;

    /** Corps optionnel */
    private String body;

    /** Identifiant lisible de l'issue (ex: TF-38) */
    private String issueIdentifier;

    /** URL relative vers l'issue */
    private String issueUrl;

    /** Nom du projet */
    private String projectName;

    /** URL relative vers le projet */
    private String projectUrl;

    private LocalDateTime createdAt;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ActorSummary {
        private Long id;
        private String name;
        private String initials;
        private String avatarUrl;
    }
}
