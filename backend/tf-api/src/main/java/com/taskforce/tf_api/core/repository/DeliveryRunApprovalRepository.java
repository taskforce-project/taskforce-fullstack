package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.enums.DeliveryApprovalStatus;
import com.taskforce.tf_api.core.enums.DeliveryRunStatus;
import com.taskforce.tf_api.core.model.DeliveryRunApproval;

import jakarta.persistence.LockModeType;

@Repository
public interface DeliveryRunApprovalRepository extends JpaRepository<DeliveryRunApproval, Long> {

    List<DeliveryRunApproval> findByRunIdOrderByCreatedAtAsc(Long runId);

    /** Les demandes de ces missions dans cet état, la plus ancienne d'abord (la vue du projet, R166). */
    List<DeliveryRunApproval> findByRunIdInAndStatusOrderByCreatedAtAsc(Collection<Long> runIds, DeliveryApprovalStatus status);

    Optional<DeliveryRunApproval> findByIdAndRunId(Long id, Long runId);

    /**
     * Charge une demande en la verrouillant jusqu'à la fin de la transaction : deux signatures qui arrivent ensemble sur
     * la même demande s'ajoutent et se comptent l'une après l'autre.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM DeliveryRunApproval a WHERE a.id = :id AND a.run.id = :runId")
    Optional<DeliveryRunApproval> findByIdAndRunIdForUpdate(@Param("id") Long id, @Param("runId") Long runId);

    long countByRunIdAndStatus(Long runId, DeliveryApprovalStatus status);

    /** Une mission qui attend la personne, telle que « Waiting for you » la lit : son issue et ses demandes ouvertes. */
    interface OpenRow {
        Long getRunId();

        Long getIssueId();

        Long getProjectId();

        String getProjectIdentifier();

        Integer getSequenceNumber();

        String getIssueTitle();

        Long getRequests();
    }

    /**
     * Ce qui attend vraiment cette personne (R128, séance n°19), une ligne par mission : ses demandes encore ouvertes,
     * pas échues, sur une mission qui peut encore les recevoir, en cours et dont le runner donne signe de vie depuis
     * {@code aliveSince} (un run « pull » perdu reste RUNNING tant que personne ne le relit). Seule la personne qui a
     * délégué répond à une demande ordinaire ; celles qu'une règle de l'entreprise adresse à d'autres personnes (R98)
     * se lisent par {@link #findOpenWithObligations}. La mission qui attend depuis le plus longtemps d'abord.
     */
    @Query("""
        SELECT r.id AS runId, i.id AS issueId, p.id AS projectId, p.identifier AS projectIdentifier,
               i.sequenceNumber AS sequenceNumber, i.title AS issueTitle, COUNT(a) AS requests
        FROM DeliveryRunApproval a JOIN a.run r JOIN r.issue i JOIN i.project p
        WHERE p.id IN :projectIds AND r.startedBy.id = :userId
          AND a.status = :pending AND a.expiresAt > :now
          AND a.approvers IS NULL AND a.signatures = 1 AND a.separateRoles = false
          AND r.status = :running AND (r.heartbeatAt IS NULL OR r.heartbeatAt >= :aliveSince)
        GROUP BY r.id, i.id, p.id, p.identifier, i.sequenceNumber, i.title
        ORDER BY MIN(a.createdAt) ASC
        """)
    List<OpenRow> findOpen(@Param("projectIds") Collection<Long> projectIds, @Param("userId") Long userId,
                           @Param("pending") DeliveryApprovalStatus pending, @Param("now") LocalDateTime now,
                           @Param("running") DeliveryRunStatus running, @Param("aliveSince") LocalDateTime aliveSince);

    /**
     * Les demandes encore ouvertes qu'une règle de l'entreprise adresse à des personnes désignées, ou à plusieurs
     * signataires (R98), sur ces projets : qui peut signer se décide ensuite, une à une.
     */
    @Query("""
        SELECT a FROM DeliveryRunApproval a JOIN FETCH a.run r JOIN FETCH r.issue i JOIN FETCH i.project p
        WHERE p.id IN :projectIds AND a.status = :pending AND a.expiresAt > :now
          AND (a.approvers IS NOT NULL OR a.signatures > 1 OR a.separateRoles = true)
          AND r.status = :running AND (r.heartbeatAt IS NULL OR r.heartbeatAt >= :aliveSince)
        ORDER BY a.createdAt ASC
        """)
    List<DeliveryRunApproval> findOpenWithObligations(@Param("projectIds") Collection<Long> projectIds,
                                                      @Param("pending") DeliveryApprovalStatus pending,
                                                      @Param("now") LocalDateTime now,
                                                      @Param("running") DeliveryRunStatus running,
                                                      @Param("aliveSince") LocalDateTime aliveSince);

    /** Clôt les demandes encore ouvertes d'un run : expirées (run terminé, ou échéance passée). */
    @Modifying
    @Query("UPDATE DeliveryRunApproval a SET a.status = :expired, a.updatedAt = :now "
        + "WHERE a.run.id = :runId AND a.status = :pending")
    int expirePending(@Param("runId") Long runId, @Param("now") LocalDateTime now,
                      @Param("pending") DeliveryApprovalStatus pending, @Param("expired") DeliveryApprovalStatus expired);
}
