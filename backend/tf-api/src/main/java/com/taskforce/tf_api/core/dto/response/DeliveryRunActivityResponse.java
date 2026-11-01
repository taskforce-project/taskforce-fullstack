package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Activité d'un run du runner local, telle que la fiche d'issue la montre : la chronologie depuis {@code after} et
 * toutes les demandes de validation du run (OSS-5.3, OSS-5.4).
 */
public record DeliveryRunActivityResponse(List<Event> events, List<Approval> approvals) {

    public record Event(int seq, String kind, String tool, String text, LocalDateTime at) {}

    /**
     * @param canDecide la personne qui lit est celle qui a délégué, et la demande attend encore sa réponse
     * @param askedBy   {@code agent} ou {@code runner} : qui pose la demande, l'agent ou TaskForce (décision J4)
     * @param action    l'action que les règles ont jugée, pour la dire en mots (R78) ; vide pour un runner plus ancien
     * @param rule      la règle qui demande, et {@code reason} sa raison ; vides quand aucune ne couvre l'action
     * @param scope     la portée d'un accord : {@code ONCE}, ou {@code MISSION} pour le reste de la mission (R46)
     */
    public record Approval(
        Long id,
        String tool,
        String summary,
        String status,
        LocalDateTime createdAt,
        LocalDateTime expiresAt,
        LocalDateTime decidedAt,
        String decidedBy,
        boolean canDecide,
        String askedBy,
        String action,
        String rule,
        String reason,
        String scope
    ) {}
}
