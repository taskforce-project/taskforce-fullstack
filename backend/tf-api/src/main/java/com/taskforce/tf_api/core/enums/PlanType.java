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
     * Plan PRO avec fonctionnalités avancées
     * Prix : 29€/mois (configurable dans Stripe)
     */
    PRO,

    /**
     * Plan entreprise avec support premium et fonctionnalités complètes
     * Prix : 99€/mois (configurable dans Stripe)
     */
    ENTERPRISE
}
