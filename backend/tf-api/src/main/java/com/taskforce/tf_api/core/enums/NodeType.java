package com.taskforce.tf_api.core.enums;

/**
 * Nature d'un node de connaissance. Stocké en VARCHAR (cf. règle d'or : enums → varchar).
 */
public enum NodeType {
    ADR,          // Architecture Decision Record
    DECISION,     // Décision business/produit
    RUNBOOK,      // Procédure opérationnelle exécutable
    SOP,          // Standard Operating Procedure
    FINDING,      // Constat (audit, dette, incident)
    CHANGELOG,    // Journal de changements
    DOC,          // Documentation générale
    SPEC,         // Spécification
    NOTE,         // Note libre
    README,       // Sommaire d'un domaine
    TEMPLATE,     // Gabarit réutilisable
    ACTION_OODA   // Boucle Observe-Orient-Decide-Act
}
