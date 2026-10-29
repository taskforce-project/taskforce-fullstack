package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.EvalCase;

@Repository
public interface EvalCaseRepository extends JpaRepository<EvalCase, Long> {

    List<EvalCase> findByWorkspaceIdAndArchivedFalseOrderByCreatedAtDesc(Long workspaceId);

    Optional<EvalCase> findByIdAndWorkspaceId(Long id, Long workspaceId);

    long countByWorkspaceIdAndArchivedFalse(Long workspaceId);

    /** Les cas d'un rejeu : actifs, et dont les critères précèdent son départ. */
    long countByWorkspaceIdAndArchivedFalseAndCriteriaAtLessThanEqual(Long workspaceId, LocalDateTime startedAt);
}
