package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Vue d'un workflow d'analyse pour le dock « Workflows IA ».
 *
 * <p>{@code plan} est une structure Java neutre (liste de maps) et <b>non</b> un {@code JsonNode} :
 * le plan est stocké sérialisé en base, mais doit ressortir comme un vrai tableau JSON,
 * directement consommable par le composant {@code AgentPlan} du front.
 *
 * <p>Le détail qui pique : Spring Boot 4 sérialise les réponses avec <b>Jackson 3</b>
 * ({@code tools.jackson}), alors que le service manipule un {@code ObjectMapper} <b>Jackson 2</b>
 * ({@code com.fasterxml.jackson}). Un {@code JsonNode} Jackson 2 exposé ici serait introspecté
 * comme un POJO inconnu et sortirait en {@code {"array":true,"bigDecimal":false,…}}. Rester sur
 * des types du JDK immunise le contrat contre les deux mappers (HTTP comme STOMP).
 */
public record AnalysisJobResponse(
    Long id,
    Long projectId,
    String projectName,
    String depth,                     // QUICK | DEEP
    String status,                    // QUEUED | RUNNING | WAITING_FOR_INPUT | DONE | FAILED
    List<Map<String, Object>> plan,   // étapes du workflow, mises à jour en direct
    String question,                  // HITL : non nul ssi status = WAITING_FOR_INPUT
    String error,                     // non nul ssi status = FAILED
    Long briefId,                     // non nul ssi status = DONE
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {}
