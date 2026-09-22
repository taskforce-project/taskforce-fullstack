package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

/**
 * Tâche remise à un runner local qui vient de réclamer un run (ADR-013) : de quoi préparer le dépôt et
 * briefer l'agent. Le contexte riche (commentaires, Brain OS) se lit ensuite par le MCP TaskForce, dans
 * la session déléguée du run.
 *
 * @param runId            run réclamé (à renvoyer dans l'en-tête de session et au résultat)
 * @param issueId          issue déléguée
 * @param issueKey         clé lisible, ex. {@code WEB-12} (sert au nom de branche et au titre de PR)
 * @param title            titre de la tâche
 * @param description      description / spec (peut être null)
 * @param projectId        projet de l'issue : seul projet modifiable pendant la session
 * @param projectName      nom du projet
 * @param workspaceSlug    workspace de l'issue : seul workspace atteignable pendant la session
 * @param repoFullName     dépôt lié au projet ({@code owner/name}), ou null si aucun
 * @param model            modèle choisi à la délégation, ou null
 * @param sessionExpiresAt fin de validité de la session déléguée
 */
public record RunnerClaimResponse(
    Long runId,
    Long issueId,
    String issueKey,
    String title,
    String description,
    Long projectId,
    String projectName,
    String workspaceSlug,
    String repoFullName,
    String model,
    LocalDateTime sessionExpiresAt
) {}
