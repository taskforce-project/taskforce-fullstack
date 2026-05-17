package com.taskforce.tf_api.core.repository;

import java.util.List;

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

    boolean existsBySourceIdAndTargetIdAndRelationType(
        Long sourceId, Long targetId,
        com.taskforce.tf_api.core.enums.IssueRelationType relationType
    );
}
