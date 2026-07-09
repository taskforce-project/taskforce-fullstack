package com.taskforce.tf_api.core.dto.response;

import java.util.List;

/**
 * Brouillon de spécification généré par l'IA pour une issue (human-in-the-loop).
 *
 * <p>Produit par {@code IssueAiService.generateSpec} <b>sans rien persister</b> : l'humain relit,
 * édite, puis approuve — l'approbation écrit un node {@code SPEC} lié à l'issue dans le Brain OS.
 * Le {@code executionPrompt} est le cœur du flux : prêt à coller dans Claude Code pour exécuter.
 *
 * <p>{@code mode} : "generated" (LLM local) ou "fallback" (LLM indisponible → gabarit déterministe
 * fondé sur l'issue + le RAG, jamais inventé).
 */
public record IssueSpecDraft(
    String spec,                 // markdown : contexte, critères d'acceptation, approche technique
    String executionPrompt,      // prompt prêt à coller dans Claude Code
    List<String> breakdown,      // découpage en sous-tâches
    List<SimilarNode> similar,   // « déjà vu ? » — notes proches du Brain OS (RAG)
    String mode
) {
    /** Une note Brain OS proche (contexte réutilisable / anti-duplication). */
    public record SimilarNode(Long nodeId, String title, String domain, Double score) {}
}
