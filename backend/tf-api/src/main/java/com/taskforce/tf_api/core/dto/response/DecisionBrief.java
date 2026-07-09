package com.taskforce.tf_api.core.dto.response;

import java.util.List;

/**
 * Brief de décision (boucle <b>OODA</b>) pour un projet — la surface « aide à la décision ».
 *
 * <p><b>Observe</b> : {@link Snapshot} = métriques réelles du projet + contexte Brain OS (RAG).
 * <b>Reflect/Predict</b> : le LLM local synthétise la situation, les risques, et les <b>3 priorités</b>
 * de demain. <b>Act</b> : l'humain valide → transforme une priorité en issue (HITL).
 *
 * <p>{@code mode} : "generated" (LLM) ou "fallback" (LLM indisponible → brief déterministe fondé sur
 * les métriques, jamais inventé).
 */
public record DecisionBrief(
    String situation,            // markdown : où en est le projet
    List<String> risks,          // risques concrets
    List<Priority> priorities,   // top 3 actions de demain
    Snapshot snapshot,           // métriques brutes (transparence / affichage)
    String mode
) {
    /** Une action prioritaire recommandée (transformable en issue). */
    public record Priority(String title, String rationale, String level) {} // level : HIGH | MEDIUM | LOW

    /** Photographie chiffrée du projet (jambe « observe »). */
    public record Snapshot(
        long total, long open, long inProgress, long completed, long overdue, long dueSoon
    ) {}
}
