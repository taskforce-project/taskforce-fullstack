package com.taskforce.tf_api.core.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.taskforce.tf_api.core.model.DecisionPriority;

public interface DecisionPriorityRepository extends JpaRepository<DecisionPriority, Long> {

    /**
     * Charge une priorité en vérifiant qu'elle appartient bien au workspace appelant
     * (une priorité n'est accessible qu'à travers le brief → projet → workspace qui la porte).
     */
    @Query("""
        SELECT p FROM DecisionPriority p
        WHERE p.id = :priorityId AND p.brief.workspace.id = :workspaceId
        """)
    Optional<DecisionPriority> findByIdAndWorkspaceId(@Param("priorityId") Long priorityId,
                                                      @Param("workspaceId") Long workspaceId);
}
