package com.taskforce.tf_api.core.enums;

/** Gabarit d'amorçage d'un brain à la création d'un workspace. */
public enum BrainTemplateType {
    BLANK,        // 16 domaines vides (READMEs de scaffolding)
    SAAS,
    ECOMMERCE,
    MARKETPLACE,
    AGENTIC,      // produit basé sur des agents IA
    TASKFORCE     // démo : brain pré-rempli avec la vraie histoire de TaskForce
}
