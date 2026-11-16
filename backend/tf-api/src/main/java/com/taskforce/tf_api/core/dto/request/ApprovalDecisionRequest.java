package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Réponse de la personne à une demande de l'agent : autoriser ou refuser. Un accord vaut une fois, ou pour le reste de
 * la mission ({@code scope = MISSION}, R46) ; sans portée, une fois. La personne peut dire pourquoi, en une ligne
 * ({@code reason}, facultatif) : la raison entre au dossier de preuve avec la décision.
 */
public record ApprovalDecisionRequest(
    @NotBlank @Pattern(regexp = "ALLOW|DENY", message = "decision must be ALLOW or DENY")
    String decision,
    @Pattern(regexp = "ONCE|MISSION", message = "scope must be ONCE or MISSION")
    String scope,
    @Size(max = 500, message = "The reason is 500 characters at most")
    String reason
) {

    public ApprovalDecisionRequest(String decision) {
        this(decision, null, null);
    }

    public ApprovalDecisionRequest(String decision, String scope) {
        this(decision, scope, null);
    }

    /** Un accord pour le reste de la mission ; un refus vaut toujours une fois. */
    public boolean forMission() {
        return "ALLOW".equals(decision) && "MISSION".equals(scope);
    }
}
