package com.taskforce.tf_api.core.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiInsightResponse {

    /** Acronyme de l'agent fictif (ex: COO, CFO, CTO) */
    private String agent;

    /** Couleur hex de l'agent pour l'UI */
    private String agentColor;

    /** Catégorie : Operations, Finance, Product, Engineering */
    private String category;

    /** Niveau d'urgence : low | medium | high */
    private String urgency;

    /** Score de confiance 0-100 */
    private int confidence;

    /** Libellé du bouton d'action */
    private String action;

    /** Texte de l'insight généré */
    private String insight;

    /**
     * Provenance : {@code generated} (le LLM a répondu) | {@code fallback} (repli déterministe) |
     * {@code upgrade} (mur payant).
     *
     * <p>Champ ajouté par {@code TF-INTEL-INSIGHTS}. Sans lui, le front était <b>incapable</b> de
     * distinguer un insight réel d'un repli — et comme l'appel LLM échouait systématiquement (clé Groq
     * vide) sans le moindre log, la carte a servi une phrase en dur pendant des mois sans que personne
     * ne puisse le voir. Même convention que le {@code mode} de {@code DecisionService}, qui alimente
     * déjà le badge « métriques seules » du decision board.</p>
     */
    private String mode;
}
