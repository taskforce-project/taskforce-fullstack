package com.taskforce.tf_api.core.dto.response;

/**
 * Message brut renvoyé par l'API Slack {@code conversations.history} (représentation interne
 * partagée core → modules pour le miroir).
 *
 * @param ts     horodatage Slack (identifiant unique du message dans le canal ; sert de curseur + dédup)
 * @param userId identifiant Slack de l'expéditeur (ex. U0123) — peut être null (messages système)
 * @param text   contenu texte
 */
public record SlackHistoryMessage(String ts, String userId, String text) {
}
