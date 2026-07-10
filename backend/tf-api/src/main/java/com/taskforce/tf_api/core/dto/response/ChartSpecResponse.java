package com.taskforce.tf_api.core.dto.response;

import java.util.List;

/**
 * Spécification d'un graphe produite par l'IA à partir d'une demande en langage naturel.
 *
 * <p><b>Principe d'honnêteté</b> : cette spec ne contient <b>aucune donnée</b>. Elle décrit
 * seulement <i>comment</i> visualiser un jeu de données réel que le front sait déjà charger via
 * les endpoints analytics existants. L'IA choisit le cadrage (jeu de données, type de graphe,
 * séries) — jamais les chiffres. Si la demande ne peut pas être satisfaite avec les données
 * disponibles, {@code unsupported} est renseigné et le front l'affiche au lieu d'un faux graphe.
 *
 * @param dataset     jeu de données réel : {@code throughput | burndown | capacity | workload}
 * @param chartType   {@code area | bar | line} (ignoré pour {@code workload}, rendu en heatmap)
 * @param bucket      granularité temporelle pour {@code throughput} : {@code day | week} (sinon null)
 * @param series      clés de séries à tracer, propres au dataset (ex. {@code resolved}, {@code opened})
 * @param unsupported message expliquant pourquoi la demande n'est pas satisfiable (sinon null)
 */
public record ChartSpecResponse(
    String title,
    String description,
    String dataset,
    String chartType,
    String bucket,
    List<String> series,
    String unsupported
) {}
