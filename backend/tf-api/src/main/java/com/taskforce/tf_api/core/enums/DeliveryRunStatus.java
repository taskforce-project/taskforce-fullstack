package com.taskforce.tf_api.core.enums;

/**
 * Statut d'un run de délégation à un agent de livraison (TF-AGENT-DELIVERY).
 * QUEUED -> RUNNING -> DONE | FAILED. La décision (accepter le résultat) reste humaine.
 */
public enum DeliveryRunStatus {
    QUEUED,
    RUNNING,
    DONE,
    FAILED
}
