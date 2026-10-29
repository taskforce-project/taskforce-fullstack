package com.taskforce.tf_api.core.dto.response;

/**
 * Le résultat d'une action que Cortex a proposée et que la personne a accordée. status : success, refused (les règles
 * de l'espace la refusent désormais) ou error.
 */
public record AssistantActionResult(String tool, String status, String output) {
}
