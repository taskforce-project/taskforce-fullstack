package com.taskforce.tf_api.core.dto.response;

/** La commande de test d'un projet après son changement ; {@code testCommand} null : aucun test lancé. */
public record ProjectTestCommandResponse(Long projectId, String testCommand) {}
