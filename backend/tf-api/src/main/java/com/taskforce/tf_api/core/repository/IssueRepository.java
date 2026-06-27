package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.model.Issue;

@Repository
public interface IssueRepository extends JpaRepository<Issue, Long> {

    /** Issues actives d'un projet (hors archivées), épinglées d'abord puis sequence_number desc */
    @Query("""
        SELECT i FROM Issue i
        WHERE i.project.id = :projectId
          AND i.archivedAt IS NULL
        ORDER BY i.pinned DESC, i.sequenceNumber DESC
        """)
    Page<Issue> findByProjectIdOrderBySequenceNumberDesc(@Param("projectId") Long projectId, Pageable pageable);

    /** Issues d'un projet avec un statut précis */
    List<Issue> findByProjectIdAndStatusIdOrderBySequenceNumberDesc(Long projectId, Long statusId);

    /** Issues par catégorie de statut */
    @Query("""
        SELECT i FROM Issue i
        WHERE i.project.id = :projectId
          AND i.status.category = :category
        ORDER BY i.sequenceNumber DESC
        """)
    List<Issue> findByProjectIdAndStatusCategory(
        @Param("projectId") Long projectId,
        @Param("category") IssueStatusCategory category
    );

    /** Issues assignées à un utilisateur dans un projet */
    List<Issue> findByProjectIdAndAssigneeIdOrderBySequenceNumberDesc(Long projectId, Long assigneeId);

    /** Issues par priorité */
    List<Issue> findByProjectIdAndPriorityOrderBySequenceNumberDesc(Long projectId, IssuePriority priority);

    /** Sous-issues d'une issue */
    List<Issue> findByParentIdOrderBySequenceNumberAsc(Long parentId);

    /** Issues sans parent (premier niveau) */
    List<Issue> findByProjectIdAndParentIsNullOrderBySequenceNumberDesc(Long projectId);

    Optional<Issue> findByProjectIdAndSequenceNumber(Long projectId, Integer sequenceNumber);

    /** Nombre d'issues d'un projet dans un statut donné (pour auto-assign position) */
    long countByProjectIdAndStatusId(Long projectId, Long statusId);

    /** Nombre total d'issues d'un projet (pour les compteurs de ProjectResponse) */
    long countByProjectId(Long projectId);

    /** Compte les issues ouvertes (non COMPLETED/CANCELLED) */
    @Query("""
        SELECT COUNT(i) FROM Issue i
        WHERE i.project.id = :projectId
          AND i.status.category NOT IN ('COMPLETED', 'CANCELLED')
        """)
    long countOpenIssues(@Param("projectId") Long projectId);

    /** Toutes les issues d'un projet pour le kanban (sans pagination) */
    @Query("""
        SELECT i FROM Issue i
        LEFT JOIN FETCH i.status
        LEFT JOIN FETCH i.type
        LEFT JOIN FETCH i.assignee
        LEFT JOIN FETCH i.labels
        WHERE i.project.id = :projectId
          AND i.parent IS NULL
          AND i.archivedAt IS NULL
        ORDER BY i.pinned DESC, i.status.position ASC, i.position ASC, i.sequenceNumber DESC
        """)
    List<Issue> findForKanban(@Param("projectId") Long projectId);

    /** Issues assignées à un utilisateur sur TOUT le workspace (vue My Work) — évite le N+1 côté front */
    @Query("""
        SELECT DISTINCT i FROM Issue i
        LEFT JOIN FETCH i.status
        LEFT JOIN FETCH i.type
        LEFT JOIN FETCH i.assignee
        LEFT JOIN FETCH i.labels
        WHERE i.project.workspace.slug = :slug
          AND i.assignee.id = :assigneeId
        ORDER BY i.sequenceNumber DESC
        """)
    List<Issue> findByWorkspaceSlugAndAssigneeId(@Param("slug") String slug,
                                                 @Param("assigneeId") Long assigneeId);

    /** Issues ouvertes, assignées, dont l'échéance est <= horizon (job d'alertes dueSoon/overdue) */
    @Query("""
        SELECT i FROM Issue i
        LEFT JOIN FETCH i.assignee
        WHERE i.assignee IS NOT NULL
          AND i.dueDate IS NOT NULL
          AND i.dueDate <= :horizon
          AND i.status.category NOT IN ('COMPLETED', 'CANCELLED')
        """)
    List<Issue> findOpenAssignedDueOnOrBefore(@Param("horizon") java.time.LocalDate horizon);

    // -------------------------------------------------------------------------
    // Analytics
    // -------------------------------------------------------------------------

    /** Nombre d'issues créées dans une plage pour une liste de projets */
    @Query("""
        SELECT COUNT(i) FROM Issue i
        WHERE i.project.id IN :projectIds
          AND i.createdAt >= :start AND i.createdAt < :end
        """)
    long countCreatedBetween(@Param("projectIds") List<Long> projectIds,
                             @Param("start") LocalDateTime start,
                             @Param("end") LocalDateTime end);

    /** Nombre d'issues complétées dans une plage pour une liste de projets */
    @Query("""
        SELECT COUNT(i) FROM Issue i
        WHERE i.project.id IN :projectIds
          AND i.completedAt >= :start AND i.completedAt < :end
        """)
    long countCompletedBetween(@Param("projectIds") List<Long> projectIds,
                               @Param("start") LocalDateTime start,
                               @Param("end") LocalDateTime end);

    /** Issues complétées dans une plage (pour calcul du temps de résolution) */
    @Query("""
        SELECT i FROM Issue i
        WHERE i.project.id IN :projectIds
          AND i.completedAt >= :start AND i.completedAt < :end
        """)
    List<Issue> findCompletedBetween(@Param("projectIds") List<Long> projectIds,
                                     @Param("start") LocalDateTime start,
                                     @Param("end") LocalDateTime end);

    /** Issues planifiées (avec startDate ou dueDate) pour tous les projets du workspace — utilisé par la roadmap */
    @Query("""
        SELECT i FROM Issue i
        LEFT JOIN FETCH i.status
        LEFT JOIN FETCH i.type
        LEFT JOIN FETCH i.assignee
        WHERE i.project.workspace.slug = :slug
          AND (i.startDate IS NOT NULL OR i.dueDate IS NOT NULL)
        ORDER BY COALESCE(i.startDate, i.dueDate) ASC
        """)
    List<Issue> findScheduledByWorkspaceSlug(@Param("slug") String slug);

    /**
     * Activité quotidienne d'un projet (QA2-32) : nombre d'issues créées par jour
     * sur les `since` derniers jours. Native (date_trunc Postgres).
     * Retourne des lignes [day:String 'YYYY-MM-DD', count:Long].
     */
    @Query(value = """
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
               COUNT(*) AS cnt
        FROM issues
        WHERE project_id = :projectId
          AND created_at >= :since
        GROUP BY 1
        ORDER BY 1
        """, nativeQuery = true)
    List<Object[]> countCreatedByDay(@Param("projectId") Long projectId,
                                     @Param("since") LocalDateTime since);

    /** Nombre d'issues ouvertes par assignee dans une liste de projets */
    @Query("""
        SELECT i.assignee.id, COUNT(i)
        FROM Issue i
        WHERE i.project.id IN :projectIds
          AND i.assignee IS NOT NULL
          AND i.status.category NOT IN ('COMPLETED', 'CANCELLED')
        GROUP BY i.assignee.id
        """)
    List<Object[]> countOpenIssuesGroupedByAssignee(@Param("projectIds") List<Long> projectIds);

    /**
     * Charge de travail par échéance (US-022) : issues OUVERTES (statut hors COMPLETED/CANCELLED),
     * assignées, dont la dueDate tombe dans [from, to), groupées par assignee + jour d'échéance.
     * Native (Postgres) : le statut vit dans issue_statuses, jointure nécessaire.
     * Retourne des lignes [userId:Long, day:String 'YYYY-MM-DD', count:Long].
     */
    @Query(value = """
        SELECT i.assignee_id AS user_id,
               to_char(i.due_date, 'YYYY-MM-DD') AS day,
               COUNT(*) AS cnt
        FROM issues i
        JOIN issue_statuses s ON s.id = i.status_id
        WHERE i.project_id IN (:projectIds)
          AND i.assignee_id IS NOT NULL
          AND i.due_date IS NOT NULL
          AND i.due_date >= :from
          AND i.due_date <  :to
          AND s.category::text NOT IN ('COMPLETED', 'CANCELLED')
        GROUP BY i.assignee_id, to_char(i.due_date, 'YYYY-MM-DD')
        """, nativeQuery = true)
    List<Object[]> countOpenIssuesByAssigneeAndDueDate(@Param("projectIds") List<Long> projectIds,
                                                       @Param("from") java.time.LocalDate from,
                                                       @Param("to") java.time.LocalDate to);
}
