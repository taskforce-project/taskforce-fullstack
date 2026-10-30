package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * Réponse de la personne à une demande de l'agent : autoriser ou refuser. Un accord vaut une fois, ou pour le reste de
 * la mission ({@code scope = MISSION}, R46) ; sans portée, une fois.
 */
public record ApprovalDecisionRequest(
    @NotBlank @Pattern(regexp = "ALLOW|DENY", message = "decision must be ALLOW or DENY")
    String decision,
    @Pattern(regexp = "ONCE|MISSION", message = "scope must be ONCE or MISSION")
    String scope
) {

    public ApprovalDecisionRequest(String decision) {
        this(decision, null);
    }

    /** Un accord pour le reste de la mission ; un refus vaut toujours une fois. */
    public boolean forMission() {
        return "ALLOW".equals(decision) && "MISSION".equals(scope);
    }
}
