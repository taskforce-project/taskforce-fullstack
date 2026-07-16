package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.taskforce.tf_api.core.model.Cycle;

import jakarta.persistence.LockModeType;

public interface CycleRepository extends JpaRepository<Cycle, Long> {

    @Query("SELECT c FROM Cycle c WHERE c.project.id = :projectId ORDER BY c.createdAt DESC")
    List<Cycle> findByProjectId(@Param("projectId") Long projectId);

    Optional<Cycle> findByIdAndProjectId(Long id, Long projectId);

    /**
     * Verrouille la ligne du cycle pour sérialiser l'écriture de son node Brain OS.
     *
     * <p>Sans ça, plusieurs issues terminées coup sur coup déclenchent autant de listeners
     * {@code @Async} qui lisent tous « aucun node » avant qu'aucun n'ait commité, et insèrent
     * chacun le leur (check-then-act → doublons). Le verrou n'est tenu que le temps d'une
     * transaction courte : l'appel LLM se fait en dehors.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Cycle c WHERE c.id = :id")
    Optional<Cycle> findByIdForUpdate(@Param("id") Long id);

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
