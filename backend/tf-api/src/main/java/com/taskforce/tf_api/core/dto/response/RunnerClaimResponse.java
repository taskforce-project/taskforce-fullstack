package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import com.taskforce.tf_api.core.harness.rules.RulesBundle;

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
 * @param rules            paquet de règles que le runner applique à chaque action, avec son empreinte
 * @param testCommand      commande de test du projet, lancée par le runner après l'agent (S1), ou null
 * @param followUp         une reprise : la personne a commenté des lignes, l'agent repart sur la même branche (R139), ou null
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
    LocalDateTime sessionExpiresAt,
    RulesBundle rules,
    String testCommand,
    FollowUp followUp
) {

    /** Une tâche neuve. */
    public RunnerClaimResponse(Long runId, Long issueId, String issueKey, String title, String description, Long projectId,
                               String projectName, String workspaceSlug, String repoFullName, String model,
                               LocalDateTime sessionExpiresAt, RulesBundle rules, String testCommand) {
        this(runId, issueId, issueKey, title, description, projectId, projectName, workspaceSlug, repoFullName, model,
            sessionExpiresAt, rules, testCommand, null);
    }

    /**
     * @param parentRunId    la mission reprise
     * @param worktreeRun    le run qui a créé le dossier de travail : Claude Code range ses sessions par dossier
     * @param branch         la branche à reprendre
     * @param base           le commit d'où elle part
     * @param sessionId      la session de l'agent à continuer, ou null
     * @param pullRequestUrl la pull request déjà ouverte, ou null
     * @param comments       les commentaires de la personne
     */
    public record FollowUp(
        Long parentRunId,
        Long worktreeRun,
        String branch,
        String base,
        String sessionId,
        String pullRequestUrl,
        List<Comment> comments
    ) {}

    /** Un commentaire sur une ligne : {@code side} vaut {@code new} ou {@code old}. */
    public record Comment(String path, int line, String side, String text) {}
}
