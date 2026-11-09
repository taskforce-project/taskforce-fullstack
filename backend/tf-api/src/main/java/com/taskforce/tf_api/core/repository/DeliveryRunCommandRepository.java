package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.taskforce.tf_api.core.enums.DeliveryCommandStatus;
import com.taskforce.tf_api.core.model.DeliveryRunCommand;

/** Les ordres donnés au runner d'une mission (R139, R140). */
public interface DeliveryRunCommandRepository extends JpaRepository<DeliveryRunCommand, Long> {

    /** Les ordres d'une mission, les plus récents d'abord. */
    List<DeliveryRunCommand> findTop50ByRunIdOrderByIdDesc(Long runId);

    boolean existsByRunIdAndStatusIn(Long runId, Collection<DeliveryCommandStatus> statuses);

    boolean existsByRunIdAndPathAndStatusIn(Long runId, String path, Collection<DeliveryCommandStatus> statuses);

    /** Les ordres en attente pour ce runner : ceux des missions qu'il a portées, déléguées par son propriétaire. */
    @Query("""
        SELECT c FROM DeliveryRunCommand c JOIN FETCH c.run r
        WHERE c.status = :pending AND r.claimedBy = :runner AND r.startedBy.id = :ownerId
        ORDER BY c.id ASC
        """)
    List<DeliveryRunCommand> findPending(
        @Param("pending") DeliveryCommandStatus pending,
        @Param("runner") String runner,
        @Param("ownerId") Long ownerId,
        Pageable pageable);

    /** Prend un ordre de façon atomique : deux runners, ou deux passages, ne le font pas deux fois. */
    @Modifying(flushAutomatically = true)
    @Query("""
        UPDATE DeliveryRunCommand c SET c.status = :running, c.takenAt = :now
        WHERE c.id = :id AND c.status = :pending
        """)
    int take(
        @Param("id") Long id,
        @Param("now") LocalDateTime now,
        @Param("pending") DeliveryCommandStatus pending,
        @Param("running") DeliveryCommandStatus running);
}
