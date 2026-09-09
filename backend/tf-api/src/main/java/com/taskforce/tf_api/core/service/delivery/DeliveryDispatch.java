package com.taskforce.tf_api.core.service.delivery;

/**
 * Résultat d'un {@code dispatch} : le run a démarré dans le cloud du provider (TF-AGENT-DELIVERY).
 * @param externalRef identifiant du run côté provider (repris pour le {@code poll})
 */
public record DeliveryDispatch(String externalRef) {}
