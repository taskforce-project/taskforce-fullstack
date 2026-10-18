package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.enums.DeliveryApprovalStatus;
import com.taskforce.tf_api.core.model.DeliveryRunApproval;

@Repository
public interface DeliveryRunApprovalRepository extends JpaRepository<DeliveryRunApproval, Long> {

    List<DeliveryRunApproval> findByRunIdOrderByCreatedAtAsc(Long runId);

    Optional<DeliveryRunApproval> findByIdAndRunId(Long id, Long runId);

    long countByRunIdAndStatus(Long runId, DeliveryApprovalStatus status);

    /** Clôt les demandes encore ouvertes d'un run : expirées (run terminé, ou échéance passée). */
    @Modifying
    @Query("UPDATE DeliveryRunApproval a SET a.status = :expired, a.updatedAt = :now "
        + "WHERE a.run.id = :runId AND a.status = :pending")
    int expirePending(@Param("runId") Long runId, @Param("now") LocalDateTime now,
                      @Param("pending") DeliveryApprovalStatus pending, @Param("expired") DeliveryApprovalStatus expired);
}
