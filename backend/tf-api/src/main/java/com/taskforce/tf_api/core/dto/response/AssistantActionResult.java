package com.taskforce.tf_api.core.dto.response;

import java.util.Map;

/**
 * Le résultat d'une action que Cortex a proposée et que la personne a accordée, ou qu'elle a défaite. status : success,
 * refused (les règles de l'espace la refusent désormais) ou error. {@code ref} : l'empreinte du résultat au dossier, que
 * « Undo » nomme ensuite ; {@code target} : l'issue que touche un geste du MCP TaskForce, dont la conversation montre
 * les cartes (sa mission, une fois confiée à un agent). Tous deux absents sinon.
 */
public record AssistantActionResult(String tool, String status, String output, String ref, Map<String, Object> target) {

    /** Un résultat sans empreinte ni issue. */
    public AssistantActionResult(String tool, String status, String output) {
        this(tool, status, output, null, null);
    }
}
