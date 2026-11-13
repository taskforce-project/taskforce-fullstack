package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.IssueRelation;

@Repository
public interface IssueRelationRepository extends JpaRepository<IssueRelation, Long> {

    /** Toutes les relations où l'issue est source OU cible */
    @Query("""
        SELECT r FROM IssueRelation r
        LEFT JOIN FETCH r.source
        LEFT JOIN FETCH r.target
        WHERE r.source.id = :issueId OR r.target.id = :issueId
        ORDER BY r.createdAt DESC
        """)
    List<IssueRelation> findByIssueId(@Param("issueId") Long issueId);

    /**
     * Les relations entre issues d'un projet, en une requête (la vue du workflow, R166) : chacune avec ses deux bouts,
     * leur statut et qui l'a posée. Sans les issues archivées, comme le board ; la plus ancienne d'abord.
     */
    @Query("""
        SELECT r FROM IssueRelation r
        JOIN FETCH r.source s JOIN FETCH s.status
        JOIN FETCH r.target t JOIN FETCH t.status
        JOIN FETCH r.createdBy
        WHERE s.project.id = :projectId AND t.project.id = :projectId
          AND s.archivedAt IS NULL AND t.archivedAt IS NULL
        ORDER BY r.createdAt ASC, r.id ASC
        """)
    List<IssueRelation> findByProjectId(@Param("projectId") Long projectId);

    /** Une relation avec ses deux bouts et qui l'a posée, pour la dire après son retrait. */
    @Query("""
        SELECT r FROM IssueRelation r
        JOIN FETCH r.source s JOIN FETCH s.status
        JOIN FETCH r.target t JOIN FETCH t.status
        JOIN FETCH r.createdBy
        WHERE r.id = :id
        """)
    Optional<IssueRelation> findWithEndsById(@Param("id") Long id);

    boolean existsBySourceIdAndTargetIdAndRelationType(
        Long sourceId, Long targetId,
        com.taskforce.tf_api.core.enums.IssueRelationType relationType
    );
}
