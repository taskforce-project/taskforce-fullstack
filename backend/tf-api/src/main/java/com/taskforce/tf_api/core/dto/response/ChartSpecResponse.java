package com.taskforce.tf_api.core.dto.response;

import java.util.List;

/**
 * Spécification d'un graphe produite par l'IA à partir d'une demande en langage naturel.
 *
 * <p>Deux modes, jamais de données inventées :
 * <ul>
 *   <li><b>{@code timeseries}</b> — référence un jeu de données réel que le front sait charger
 *       (throughput / burndown / capacity / workload) ; {@code data} est null.</li>
 *   <li><b>{@code breakdown}</b> — répartition « X par Y » calculée en base par une requête sûre
 *       ({@link com.taskforce.tf_api.core.service.agent.AnalyticsQueryService}) ; {@code data}
 *       porte les points réels (libellé → valeur), {@code dataset}/{@code series} sont null.</li>
 * </ul>
 * Si la demande n'est pas satisfiable, {@code mode = "unsupported"} et {@code unsupported} explique.
 */
public record ChartSpecResponse(
    String title,
    String description,
    String mode,                    // timeseries | breakdown | unsupported
    // ── timeseries ──
    String dataset,                 // throughput | burndown | capacity | workload
    String chartType,               // area | bar | line
    String bucket,                  // day | week (throughput)
    List<String> series,            // clés de séries
    // ── breakdown ──
    List<NamedValue> data,          // points réels calculés en base
    String dimension,               // axe de regroupement (PROJECT | STATUS | …) — pour ré-exécuter
    String measure,                 // mesure (COUNT | POINTS)
    String scope,                   // périmètre (ALL | OPEN | DONE)
    String xLabel,                  // libellé de la dimension (ex. « Projet »)
    String yLabel,                  // libellé de la mesure (ex. « Nombre d'issues »)
    // ──
    String unsupported,
    List<ChartSuggestion> suggestions   // reformulations proposées quand unsupported
) {}
