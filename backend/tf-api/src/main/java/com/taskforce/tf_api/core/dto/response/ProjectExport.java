package com.taskforce.tf_api.core.dto.response;

import java.util.List;

/**
 * Export COMPLET d'un projet (P1b bêta) — sérialisé en JSON pour téléchargement. Permet à un bêta-testeur
 * de reprendre son travail dans un autre outil à la fermeture de la bêta.
 */
public record ProjectExport(
    String identifier,
    String name,
    String description,
    String exportedAt,
    int issueCount,
    List<IssueExport> issues
) {}
