package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** Décision sur une demande de validation de l'agent : {@code ALLOW} ou {@code DENY} (OSS-5.4). */
public record ApprovalDecisionRequest(
    @NotBlank @Pattern(regexp = "ALLOW|DENY", message = "decision must be ALLOW or DENY")
    String decision
) {}
