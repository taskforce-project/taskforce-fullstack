package com.taskforce.tf_api.core.repository;

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

    /** Issues d'un projet (toutes), triées par sequence_number desc */
    Page<Issue> findByProjectIdOrderBySequenceNumberDesc(Long projectId, Pageable pageable);

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
        ORDER BY i.status.position ASC, i.position ASC, i.sequenceNumber DESC
        """)
    List<Issue> findForKanban(@Param("projectId") Long projectId);
}
