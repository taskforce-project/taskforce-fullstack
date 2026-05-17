package com.taskforce.tf_api.core.dto.response;

public record AnalyticsKpisResponse(
    long tasksResolved,
    int  tasksResolvedDelta,
    double avgResolutionDays,
    double avgResolutionDaysDelta,
    long velocity,
    int  velocityDelta,
    long activeCycles
) {}
