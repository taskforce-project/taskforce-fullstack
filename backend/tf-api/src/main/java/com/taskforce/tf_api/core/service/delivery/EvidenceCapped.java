package com.taskforce.tf_api.core.service.delivery;

/**
 * Le dossier d'une mission en cours a atteint son plafond (R159, second tour, N2) : le constat est écrit, la mission doit
 * s'arrêter ({@link MissionEvidenceCap}).
 */
public record EvidenceCapped(Long runId) {
}
