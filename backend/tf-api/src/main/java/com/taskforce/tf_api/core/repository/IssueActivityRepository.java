package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.enums.IssueActivityType;
import com.taskforce.tf_api.core.model.IssueActivity;

@Repository
public interface IssueActivityRepository extends JpaRepository<IssueActivity, Long> {

    List<IssueActivity> findByIssueIdOrderByCreatedAtAsc(Long issueId);

    // -------------------------------------------------------------------------
    // Profile stats
    // -------------------------------------------------------------------------

    /** Compte les activités d'un type précis pour un acteur dans un workspace */
    @Query("""
        SELECT COUNT(a) FROM IssueActivity a
        WHERE a.actor.id = :userId
          AND a.action = :action
          AND a.issue.project.workspace.slug = :slug
        """)
    long countByActorIdAndActionAndWorkspaceSlug(
        @Param("userId") Long userId,
        @Param("action") IssueActivityType action,
        @Param("slug") String slug
    );

    /** Nombre de jours distincts où l'acteur a eu au moins une activité */
    @Query(value = """
        SELECT COUNT(DISTINCT DATE(a.created_at))
        FROM issue_activity a
        JOIN issues i ON a.issue_id = i.id
        JOIN projects p ON i.project_id = p.id
        JOIN workspaces w ON p.workspace_id = w.id
        WHERE a.actor_id = :userId AND w.slug = :slug
        """, nativeQuery = true)
    long countDistinctActiveDays(
        @Param("userId") Long userId,
        @Param("slug") String slug
    );

    /** Activités récentes d'un acteur dans un workspace (pour le feed) */
    @Query("""
        SELECT a FROM IssueActivity a
        JOIN FETCH a.issue i
        JOIN FETCH i.project p
        WHERE a.actor.id = :userId
          AND i.project.workspace.slug = :slug
        ORDER BY a.createdAt DESC
        """)
    List<IssueActivity> findRecentByActorIdAndWorkspaceSlug(
        @Param("userId") Long userId,
        @Param("slug") String slug,
        Pageable pageable
    );

    /** Données brutes pour le heatmap : (date, count) groupés par jour */
    @Query(value = """
        SELECT DATE(a.created_at) AS day, COUNT(*) AS cnt
        FROM issue_activity a
        JOIN issues i ON a.issue_id = i.id
        JOIN projects p ON i.project_id = p.id
        JOIN workspaces w ON p.workspace_id = w.id
        WHERE a.actor_id = :userId
          AND w.slug = :slug
          AND a.created_at >= :since
        GROUP BY DATE(a.created_at)
        ORDER BY day ASC
        """, nativeQuery = true)
    List<Object[]> findHeatmapByActorIdAndWorkspaceSlug(
        @Param("userId") Long userId,
        @Param("slug") String slug,
        @Param("since") LocalDateTime since
    );
}
