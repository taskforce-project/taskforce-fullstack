package com.taskforce.tf_api.core.dto.response;

/**
 * Abonnement courant d'un utilisateur (lu depuis le profil User — pas d'appel Stripe pour la lecture).
 * Alimente la page Facturation. {@code status} retombe sur le plan si aucun statut Stripe.
 */
public record SubscriptionInfoResponse(
    Long userId,
    String planType,          // FREE | PRO | ENTERPRISE
    String status,            // ACTIVE | CANCELED | … (repli : plan)
    String currentPeriodEnd,  // date-time ISO de renouvellement/expiration, ou null
    boolean cancelAtPeriodEnd
) {}
