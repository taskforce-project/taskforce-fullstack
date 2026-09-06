package com.taskforce.tf_api.core.dto.response;

/** Resultat d'une synchronisation Slack -> Brain OS (messages ingeres en nodes). */
public record SlackSyncResponse(int created, int updated, int total) {}
