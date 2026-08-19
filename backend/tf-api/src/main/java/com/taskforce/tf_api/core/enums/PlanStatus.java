package com.taskforce.tf_api.core.enums;

/**
 * Statut d'un abonnement Stripe
 * Correspond aux statuts officiels de Stripe Subscription
 * @see <a href="https://stripe.com/docs/api/subscriptions/object#subscription_object-status">Stripe Subscription Status</a>
 */
public enum PlanStatus {
    /**
     * L'abonnement est actif et valide
     */
    ACTIVE,

    /**
     * L'abonnement a été annulé et ne se renouvellera pas
     */
    CANCELED,

    /**
     * Le paiement a échoué et l'abonnement est en retard de paiement
     */
    PAST_DUE,

    /**
     * L'abonnement est en période d'essai
     */
    TRIALING,

    /**
     * L'abonnement a été créé mais le paiement initial est incomplet
     */
    INCOMPLETE,

    /**
     * Le premier paiement n'a jamais été complété et a expiré
     */
    INCOMPLETE_EXPIRED,

    /**
     * L'abonnement n'est pas payé après plusieurs tentatives
     */
    UNPAID
}
