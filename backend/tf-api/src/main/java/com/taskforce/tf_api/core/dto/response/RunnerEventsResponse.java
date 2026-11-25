package com.taskforce.tf_api.core.dto.response;

/**
 * Ce que TaskForce répond à un lot d'événements du runner. {@code stop} : le dossier de la mission a atteint son plafond,
 * et TaskForce l'arrête ; le runner refuse alors toute action de l'agent, puis arrête Claude Code, sans attendre son
 * prochain signe de vie (R159 de #551, troisième tour, c-c).
 */
public record RunnerEventsResponse(boolean stop) {}
