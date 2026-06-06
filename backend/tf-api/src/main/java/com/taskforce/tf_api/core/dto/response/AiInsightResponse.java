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
}
