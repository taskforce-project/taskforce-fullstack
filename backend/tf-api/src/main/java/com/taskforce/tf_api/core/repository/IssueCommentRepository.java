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
     * Ctrl+K (R141) : les commentaires des issues non archivées des projets donnés qui répondent à {@code tsquery}
     * ({@code to_tsquery}, configuration {@code simple}), les plus récents d'abord. Le texte de la requête est déjà réduit
     * à des mots : rien ne peut casser sa syntaxe.
     */
    @Query(value = """
        SELECT c.* FROM issue_comments c
        JOIN issues i ON i.id = c.issue_id
        WHERE i.project_id IN (:projectIds)
          AND i.archived_at IS NULL
          AND to_tsvector('simple', c.content) @@ to_tsquery('simple', :tsquery)
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT :limit
        """, nativeQuery = true)
    List<IssueComment> searchInProjects(@Param("projectIds") List<Long> projectIds, @Param("tsquery") String tsquery,
                                        @Param("limit") int limit);

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
