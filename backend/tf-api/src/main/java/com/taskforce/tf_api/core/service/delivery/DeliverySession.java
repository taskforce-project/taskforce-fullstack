package com.taskforce.tf_api.core.service.delivery;

/**
 * Session déléguée d'un runner (ADR-013) : le temps d'un run, l'agent agit <b>au nom du délégant</b>,
 * dans un périmètre resserré par {@link DeliverySessionScope}.
 *
 * @param runId           run en cours qui porte la session
 * @param workspaceSlug   workspace du run : seul workspace atteignable, en lecture
 * @param projectId       projet du run : seul projet modifiable
 * @param ownerEmail      délégant, dont les droits plafonnent la session
 * @param ownerKeycloakId identifiant Keycloak du délégant (claim {@code sub} du principal délégué)
 * @param runnerClientId  runner qui tient la session (traçabilité)
 */
public record DeliverySession(
    Long runId,
    String workspaceSlug,
    Long projectId,
    String ownerEmail,
    String ownerKeycloakId,
    String runnerClientId
) {}
