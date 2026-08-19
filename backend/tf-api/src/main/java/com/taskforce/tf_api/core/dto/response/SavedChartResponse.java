package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Un graphe épinglé. {@code spec} est la {@code ChartSpec} du front (structure JDK neutre) —
 * jamais de données ; elles sont recalculées à l'affichage depuis les vraies sources.
 */
public record SavedChartResponse(
    Long id,
    String title,
    Map<String, Object> spec,
    LocalDateTime createdAt
) {}
