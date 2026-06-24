package com.taskforce.tf_api.core.dto.response;

/**
 * Un point d'activité quotidienne d'un projet (QA2-32).
 * `date` au format ISO 'YYYY-MM-DD', `count` = nb d'issues créées ce jour-là.
 */
public record ProjectActivityPointResponse(String date, long count) {
}
