package com.taskforce.tf_api.core.dto.response;

import lombok.Builder;
import lombok.Data;

/**
 * Événement temps réel d'une issue, diffusé via STOMP sur {@code /topic/projects.{projectId}}.
 * Permet au board de se mettre à jour en direct (PROD-1.6), et à la fiche ouverte d'une issue de relire son activité
 * (rejeu de la 1.8.0 : le commentaire d'un agent n'apparaissait qu'en rouvrant l'issue).
 */
@Data
@Builder
public class IssueRealtimeEvent {

    /** {@code created} | {@code updated} | {@code deleted} | {@code activity} (l'activité de l'issue a bougé) */
    private String action;
    private Long projectId;
    private Long issueId;
    /** Issue complète pour created/updated ; null pour deleted et activity. */
    private IssueResponse issue;
}
