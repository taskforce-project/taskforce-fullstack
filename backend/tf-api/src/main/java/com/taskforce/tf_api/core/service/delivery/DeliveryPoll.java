package com.taskforce.tf_api.core.service.delivery;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;

/**
 * Résultat d'un {@code poll} : état courant du run + résultat quand il est terminé (TF-AGENT-DELIVERY).
 *
 * @param status    RUNNING (en cours), DONE (terminé) ou FAILED
 * @param summary   résumé produit (quand DONE)
 * @param resultUrl lien du résultat selon la tâche : PR, doc... (quand DONE)
 * @param error     message d'échec (quand FAILED)
 */
public record DeliveryPoll(
    DeliveryRunStatus status,
    String summary,
    String resultUrl,
    String error
) {}
