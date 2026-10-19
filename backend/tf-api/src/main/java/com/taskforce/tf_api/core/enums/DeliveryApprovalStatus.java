package com.taskforce.tf_api.core.enums;

/** État d'une demande de validation d'une action de l'agent (OSS-5.4). */
public enum DeliveryApprovalStatus {
    /** En attente de la personne qui a délégué. */
    PENDING,
    ALLOWED,
    DENIED,
    /** Pas de réponse avant l'échéance, ou run terminé entre-temps : l'action est refusée. */
    EXPIRED
}
