package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Ce que Cortex peut lire dans un espace pour la personne qui demande (R125, séance n°18) : chaque source comptée, avec
 * la date de son dernier changement. Des contenus, jamais des gestes : rien n'y suit l'activité de l'agent (R57).
 *
 * @param sources dans l'ordre où le volet « Progress » les montre : {@code projects}, {@code issues}, {@code comments},
 *                {@code notes}, {@code documents}, {@code connectors}
 */
public record CortexSourcesResponse(List<Source> sources) {

    /** Une source : sa clé, combien elle en compte, et quand la plus récente a changé ({@code null} sans aucune). */
    public record Source(String key, long count, LocalDateTime changedAt) {
    }
}
