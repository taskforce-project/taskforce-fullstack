package com.taskforce.tf_api.core.dto.response;

import lombok.Builder;
import lombok.Data;

/**
 * Événement temps réel d'une issue, diffusé via STOMP sur {@code /topic/projects.{projectId}}.
 * Permet au board de se mettre à jour en direct (PROD-1.6).
 */
@Data
@Builder
public class IssueRealtimeEvent {

    /** {@code created} | {@code updated} | {@code deleted} */
    private String action;
    private Long projectId;
    private Long issueId;
    /** Issue complète pour created/updated ; null pour deleted. */
    private IssueResponse issue;
}
