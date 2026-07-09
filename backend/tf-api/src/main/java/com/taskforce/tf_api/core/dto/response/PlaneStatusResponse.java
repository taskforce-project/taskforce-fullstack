package com.taskforce.tf_api.core.dto.response;

/** État de la connexion Plane d'un workspace + nombre de nodes ingérés depuis Plane. */
public record PlaneStatusResponse(
    boolean connected,
    String planeWorkspace,
    long ingestedNodes
) {}
