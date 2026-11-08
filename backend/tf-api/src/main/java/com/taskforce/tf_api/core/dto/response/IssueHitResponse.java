package com.taskforce.tf_api.core.dto.response;

/**
 * Une issue trouvée par la recherche de la fenêtre (Ctrl+K, le « @ » et le « + » du compositeur ; R123 et R124, séance
 * n°18) : de quoi la reconnaître et l'ouvrir dans le volet, ou la joindre à une demande à Cortex, rien de plus.
 *
 * @param key            la clé de l'issue (« OPS-35 »)
 * @param status         le nom de sa colonne ; null sans colonne
 * @param statusCategory la catégorie de sa colonne (TODO, IN_PROGRESS, COMPLETED…) ; null sans colonne
 */
public record IssueHitResponse(Long id, Long projectId, String key, String title, String status, String statusCategory) {}
