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

    Optional<CycleIssue> findByCycleIdAndIssueId(Long cycleId, Long issueId);

    boolean existsByCycleIdAndIssueId(Long cycleId, Long issueId);

    long countByCycleId(Long cycleId);
}
