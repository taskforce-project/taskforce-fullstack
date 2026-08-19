package com.taskforce.tf_api.core.dto.response;

/** Résultat d'une synchronisation Plane → Brain OS. */
public record PlaneSyncResponse(int created, int updated, int total) {}
