package com.taskforce.tf_api.core.enums;

/**
 * Type de plan d'abonnement (tarification par membre/mois).
 * Ordre = niveau croissant : FREE &lt; BASIC &lt; BUSINESS &lt; ENTERPRISE.
 */
public enum PlanType {
    /** Gratuit — pour découvrir, périmètre limité. */
    FREE,

    /** Basic — premier palier payant (par membre/mois). */
    BASIC,

    /** Business — équipes, fonctionnalités avancées + IA (par membre/mois). */
    BUSINESS,

    /** Enterprise — sécurité, conformité, déploiement dédié (sur devis). */
    ENTERPRISE
}
