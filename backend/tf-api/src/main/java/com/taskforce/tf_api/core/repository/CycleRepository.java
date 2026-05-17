package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.taskforce.tf_api.core.model.Cycle;

public interface CycleRepository extends JpaRepository<Cycle, Long> {

    @Query("SELECT c FROM Cycle c WHERE c.project.id = :projectId ORDER BY c.createdAt DESC")
    List<Cycle> findByProjectId(@Param("projectId") Long projectId);

    Optional<Cycle> findByIdAndProjectId(Long id, Long projectId);

    boolean existsByNameAndProjectId(String name, Long projectId);

    /** Cycles actifs pour tous les projets d'un workspace */
    @Query("""
        SELECT c FROM Cycle c
        WHERE c.project.workspace.slug = :slug
          AND c.status = com.taskforce.tf_api.core.enums.CycleStatus.ACTIVE
        ORDER BY c.startDate ASC
        """)
    List<Cycle> findActiveByWorkspaceSlug(@Param("slug") String slug);
}
