package com.taskforce.tf_api.core.dto.response;

import java.util.Map;

/** Une carte de dashboard épinglée, telle que rendue par le registre front. */
public record DashboardCardResponse(
    Long id,
    String cardType,
    String title,
    Map<String, Object> config,
    String timeRange,
    Integer position
) {}
