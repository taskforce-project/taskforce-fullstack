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
          AND c.status = :#{T(com.taskforce.tf_api.core.enums.CycleStatus).ACTIVE}
        ORDER BY c.startDate ASC
        """)
    List<Cycle> findActiveByWorkspaceSlug(@Param("slug") String slug);

    /** Nombre de cycles complétés créés par un utilisateur dans un workspace */
    @Query("""
        SELECT COUNT(c) FROM Cycle c
        WHERE c.createdBy.id = :userId
          AND c.project.workspace.slug = :slug
          AND c.status = :#{T(com.taskforce.tf_api.core.enums.CycleStatus).COMPLETED}
        """)
    long countCompletedByCreatorIdAndWorkspaceSlug(
        @Param("userId") Long userId,
        @Param("slug") String slug
    );

    /** Nombre total de cycles dans un workspace (pour les compteurs profil) */
    @Query("""
        SELECT COUNT(c) FROM Cycle c
        WHERE c.project.workspace.slug = :slug
        """)
    long countByWorkspaceSlug(@Param("slug") String slug);
}
