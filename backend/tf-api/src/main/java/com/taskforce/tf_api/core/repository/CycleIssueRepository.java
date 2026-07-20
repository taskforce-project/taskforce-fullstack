package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.taskforce.tf_api.core.model.CycleIssue;
import com.taskforce.tf_api.core.model.Issue;

public interface CycleIssueRepository extends JpaRepository<CycleIssue, Long> {

    @Query("SELECT ci FROM CycleIssue ci JOIN FETCH ci.issue WHERE ci.cycle.id = :cycleId ORDER BY ci.addedAt ASC")
    List<CycleIssue> findByCycleId(@Param("cycleId") Long cycleId);

    /** Cycles auxquels une issue est rattachée (ingestion Brain OS : retrouver le cycle porteur). */
    @Query("SELECT ci FROM CycleIssue ci JOIN FETCH ci.cycle WHERE ci.issue.id = :issueId")
    List<CycleIssue> findByIssueId(@Param("issueId") Long issueId);

    Optional<CycleIssue> findByCycleIdAndIssueId(Long cycleId, Long issueId);

    boolean existsByCycleIdAndIssueId(Long cycleId, Long issueId);

    long countByCycleId(Long cycleId);

    /**
     * Nombre d'issues par cycle, pour un lot de cycles — une requête au lieu d'un
     * {@link #countByCycleId(Long)} par cycle (N+1 dans les vues agrégées).
     * Chaque ligne est un {@code [cycleId, count]} ; un cycle sans issue n'apparaît pas.
     */
    @Query("SELECT ci.cycle.id, COUNT(ci) FROM CycleIssue ci WHERE ci.cycle.id IN :cycleIds GROUP BY ci.cycle.id")
    List<Object[]> countByCycleIds(@Param("cycleIds") List<Long> cycleIds);
}
