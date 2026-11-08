package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.IssueComment;

@Repository
public interface IssueCommentRepository extends JpaRepository<IssueComment, Long> {

    List<IssueComment> findByIssueIdOrderByCreatedAtAsc(Long issueId);

    long countByIssueId(Long issueId);

    /**
     * Les commentaires des issues non archivées de chaque projet de l'espace, et leur dernier changement : Cortex les lit
     * avant de résumer une issue (R125).
     */
    @Query("""
        SELECT c.issue.project.id AS projectId, COUNT(c) AS total, MAX(c.updatedAt) AS changedAt FROM IssueComment c
        WHERE c.issue.project.workspace.id = :workspaceId AND c.issue.archivedAt IS NULL
        GROUP BY c.issue.project.id
        """)
    List<IssueRepository.ProjectCount> countByProject(@Param("workspaceId") Long workspaceId);
}
