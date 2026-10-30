package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

/**
 * État d'un run de délégation à un agent (TF-AGENT-DELIVERY). {@code summary}/{@code resultUrl} non nuls
 * quand DONE ; {@code error} non null quand FAILED.
 *
 * <p>{@code issueKey}, {@code issueTitle}, {@code projectId} et {@code projectName} rendent un run
 * <b>lisible et cliquable</b> hors de sa fiche d'issue (historique des délégations, canvas) : sans eux
 * l'interface ne pouvait afficher que « Issue #1080 », et n'avait pas le projet qu'exige le lien profond
 * {@code /projects/{projectId}?issue={issueId}}.</p>
 */
public record DeliveryRunResponse(
    Long id,
    Long issueId,
    String issueKey,
    String issueTitle,
    Long projectId,
    String projectName,
    String providerKey,
    String model,
    String status,
    String summary,
    String resultUrl,
    String error,
    /** Refusée au départ par une règle : l'écran dit « Not started », pas « Agent failed » (R38). */
    boolean refused,
    Long startedById,
    LocalDateTime createdAt,
    LocalDateTime updatedAt,
    /** Le travail commencé (le runner a pris la mission) et fini, pour la durée de la carte de résultat (R78). */
    LocalDateTime claimedAt,
    LocalDateTime endedAt,
    /** La version des règles de la mission, que la carte rappelle dans « How it was done ». */
    Integer rulesVersion,
    /** La branche de l'agent et ses commits ; absents sans changement de code. */
    String branch,
    Integer commits,
    /** Les tests du projet tels que le runner les a lancés (R32), jamais ce que l'agent en dit ; absents sans tests. */
    Tests tests,
    /** Le geste de la personne sur la carte : APPLIED, DISCARDED ou RETRIED, et quand ; vides tant qu'elle n'a pas tranché. */
    String outcome,
    LocalDateTime outcomeAt
) {

    /** Un run sans les faits de la carte de résultat. */
    public DeliveryRunResponse(Long id, Long issueId, String issueKey, String issueTitle, Long projectId, String projectName,
                               String providerKey, String model, String status, String summary, String resultUrl, String error,
                               boolean refused, Long startedById, LocalDateTime createdAt, LocalDateTime updatedAt) {
        this(id, issueId, issueKey, issueTitle, projectId, projectName, providerKey, model, status, summary, resultUrl, error,
            refused, startedById, createdAt, updatedAt, null, null, null, null, null, null, null, null);
    }

    /** {@code passedCount} sur {@code total}, quand la sortie des tests le dit. */
    public record Tests(String command, boolean ran, boolean passed, Integer passedCount, Integer total) {}
}
