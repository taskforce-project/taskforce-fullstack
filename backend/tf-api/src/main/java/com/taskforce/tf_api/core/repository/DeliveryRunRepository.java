package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRun;

import jakarta.persistence.LockModeType;

/**
 * Runs de délégation à un agent (TF-AGENT-DELIVERY). Un run par délégation ; le plus récent d'une
 * issue est celui affiché.
 */
public interface DeliveryRunRepository extends JpaRepository<DeliveryRun, Long> {

    /** Dernier run d'une issue (pour afficher l'état de délégation courant). */
    Optional<DeliveryRun> findTopByIssueIdOrderByCreatedAtDesc(Long issueId);

    /**
     * Runs de délégation des projets donnés (issue → projet), les plus récents d'abord. Sert la vue
     * « workflow » au niveau workspace : on borne aux projets que l'utilisateur peut voir (calculés en
     * amont) pour ne jamais fuiter les runs d'un projet privé. L'issue et son projet sont chargés dans la
     * même requête : la réponse porte leur clé, leur titre et leur projet, et sans cela chaque run
     * coûterait une requête de plus (jusqu'à 200 runs par appel).
     */
    @Query("""
        SELECT r FROM DeliveryRun r JOIN FETCH r.issue i JOIN FETCH i.project p
        WHERE p.id IN :projectIds ORDER BY r.updatedAt DESC
        """)
    List<DeliveryRun> findByProjectIds(@Param("projectIds") Collection<Long> projectIds, Pageable pageable);

    /**
     * Les missions d'un projet, page par page (la vue du workflow, R166) : les plus récentes d'abord, dans un ordre qui ne
     * bouge pas quand une mission avance (sa date de création, puis son numéro). L'issue, le projet et la personne qui a
     * délégué viennent avec, comme pour la liste de l'espace.
     */
    @Query(value = """
        SELECT r FROM DeliveryRun r JOIN FETCH r.issue i JOIN FETCH i.project p LEFT JOIN FETCH r.startedBy
        WHERE p.id = :projectId ORDER BY r.createdAt DESC, r.id DESC
        """,
        countQuery = "SELECT COUNT(r) FROM DeliveryRun r WHERE r.issue.project.id = :projectId")
    Page<DeliveryRun> findByProjectId(@Param("projectId") Long projectId, Pageable pageable);

    /** Une mission de ce projet, avec son issue, son projet et la personne qui a délégué ; vide pour une mission d'ailleurs. */
    @Query("""
        SELECT r FROM DeliveryRun r JOIN FETCH r.issue i JOIN FETCH i.project p LEFT JOIN FETCH r.startedBy
        WHERE r.id = :runId AND p.id = :projectId
        """)
    Optional<DeliveryRun> findInProject(@Param("runId") Long runId, @Param("projectId") Long projectId);

    /** Une mission qui en reprend une autre (R139) : l'une et l'autre. */
    interface FollowUpRow {
        Long getParentId();

        Long getRunId();
    }

    /** Les missions qui reprennent celles-ci, de la plus ancienne à la plus récente. */
    @Query("""
        SELECT r.parentRun.id AS parentId, r.id AS runId FROM DeliveryRun r
        WHERE r.parentRun.id IN :runIds ORDER BY r.id ASC
        """)
    List<FollowUpRow> findFollowUps(@Param("runIds") Collection<Long> runIds);

    // =========================================================================
    // Runner local (ADR-013) : file d'attente « pull »
    // =========================================================================

    /**
     * Runs en attente d'un runner, du plus ancien au plus récent, <b>bornés au délégant</b> : un runner
     * ne voit jamais que les runs lancés par son propriétaire.
     */
    @Query("""
        SELECT r FROM DeliveryRun r
        WHERE r.providerKey = :providerKey AND r.status = :queued
          AND r.claimedBy IS NULL AND r.startedBy.id = :ownerId
        ORDER BY r.createdAt ASC
        """)
    List<DeliveryRun> findClaimable(
        @Param("providerKey") String providerKey,
        @Param("queued") DeliveryRunStatus queued,
        @Param("ownerId") Long ownerId,
        Pageable pageable);

    /**
     * Réclame un run de façon <b>atomique</b> : la condition sur le statut et sur {@code claimedBy} fait
     * qu'un seul runner gagne, même si deux réclament en même temps. Renvoie 1 si gagné, 0 sinon.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        UPDATE DeliveryRun r
        SET r.status = :running, r.claimedBy = :runner, r.claimedAt = :now, r.heartbeatAt = :now,
            r.externalRef = :externalRef, r.updatedAt = :now
        WHERE r.id = :id AND r.status = :queued AND r.claimedBy IS NULL
        """)
    int claim(
        @Param("id") Long id,
        @Param("runner") String runner,
        @Param("externalRef") String externalRef,
        @Param("now") LocalDateTime now,
        @Param("queued") DeliveryRunStatus queued,
        @Param("running") DeliveryRunStatus running);

    /** Note sur un run les règles remises à son runner : la version et l'empreinte du paquet. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE DeliveryRun r SET r.rulesVersion = :version, r.rulesDigest = :digest WHERE r.id = :id")
    int recordRules(@Param("id") Long id, @Param("version") Integer version, @Param("digest") String digest);

    /**
     * Clôt en échec un run « pull » que personne n'a réclamé dans le délai. Même garde que {@link #claim} :
     * encore en attente et sans runner, donc un claim concurrent gagne toujours. Renvoie 1 si clos ici.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        UPDATE DeliveryRun r SET r.status = :failed, r.error = :error, r.updatedAt = :now
        WHERE r.id = :id AND r.status = :queued AND r.claimedBy IS NULL
        """)
    int expireUnclaimed(
        @Param("id") Long id,
        @Param("error") String error,
        @Param("now") LocalDateTime now,
        @Param("queued") DeliveryRunStatus queued,
        @Param("failed") DeliveryRunStatus failed);

    /** Signe de vie d'un runner sur SON run en cours. Renvoie 1 si le run lui appartient encore. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        UPDATE DeliveryRun r SET r.heartbeatAt = :now
        WHERE r.id = :id AND r.claimedBy = :runner AND r.status = :running
        """)
    int heartbeat(
        @Param("id") Long id,
        @Param("runner") String runner,
        @Param("now") LocalDateTime now,
        @Param("running") DeliveryRunStatus running);

    /** Charge un run en le verrouillant : le résultat du runner ne croise pas un autre écrivain. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM DeliveryRun r WHERE r.id = :id")
    Optional<DeliveryRun> findByIdForUpdate(@Param("id") Long id);

    /** Run d'un provider « pull » retrouvé par son handle (posé au claim). */
    Optional<DeliveryRun> findByExternalRef(String externalRef);
}
