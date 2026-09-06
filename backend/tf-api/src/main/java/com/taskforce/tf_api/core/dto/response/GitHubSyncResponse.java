package com.taskforce.tf_api.core.dto.response;

/** Resultat d'une synchronisation GitHub -> Brain OS (issues + PR ingerees en nodes). */
public record GitHubSyncResponse(int created, int updated, int total) {}
