package com.taskforce.tf_api.core.enums;

/**
 * Type de plan d'abonnement
 */
public enum PlanType {
    /**
     * Plan gratuit avec fonctionnalités limitées
     */
    FREE,

    /**
     * Plan premium avec fonctionnalités avancées
     * Prix : 29€/mois (configurable dans Stripe)
     */
    PREMIUM,

    /**
     * Plan entreprise avec support premium et fonctionnalités complètes
     * Prix : 99€/mois (configurable dans Stripe)
     */
    ENTERPRISE
}
