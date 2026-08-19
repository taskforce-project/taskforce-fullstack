package com.taskforce.tf_api.core.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Un déplacement proposé dans un plan de redistribution (PROD-1.12) : une issue passe d'un membre
 * surchargé ({@code from}) à un candidat mieux placé ({@code to}), avec le score et le motif Smart Assign.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RedistributionMoveResponse {

    private Long issueId;
    private String issueTitle;
    private Long projectId;
    private String projectName;

    private Long fromUserId;
    private String fromName;

    private Long toUserId;
    private String toName;

    /** Score Smart Assign du candidat cible (0-100). */
    private int toScore;
    /** Motif lisible (Groq si dispo, sinon repli Java). */
    private String reason;

    private String priority;
    private Integer storyPoints;
}
