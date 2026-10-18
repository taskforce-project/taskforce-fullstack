package com.taskforce.tf_api.core.dto.request;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Application d'un plan de redistribution validé par un manager (PROD-1.12).
 * Chaque déplacement réassigne une issue à un nouveau membre.
 */
@Data
public class ApplyRedistributionRequest {

    @NotEmpty(message = "At least one move is required")
    @Valid
    private List<Move> moves;

    @Data
    public static class Move {
        @NotNull(message = "issueId is required")
        private Long issueId;

        @NotNull(message = "toUserId is required")
        private Long toUserId;
    }
}
