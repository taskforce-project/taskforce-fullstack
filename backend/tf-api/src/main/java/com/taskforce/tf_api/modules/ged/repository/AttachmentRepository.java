package com.taskforce.tf_api.modules.ged.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.modules.ged.domain.Attachment;

@Repository
public interface AttachmentRepository extends JpaRepository<Attachment, Long> {

    List<Attachment> findByIssueIdOrderByCreatedAtDesc(Long issueId);

    void deleteByIdAndUploadedById(Long id, Long uploadedById);

    /**
     * Le nombre de pièces jointes de chaque issue d'un projet, en une requête quel que soit le nombre d'issues (la vue du
     * workflow, lot W1). Chaque ligne est un {@code [issueId, count]}, dans l'ordre des issues ; une issue sans pièce
     * jointe n'a pas de ligne, une issue archivée non plus, comme sur le board.
     */
    @Query("""
        SELECT a.issue.id, COUNT(a) FROM Attachment a
        WHERE a.issue.project.id = :projectId AND a.issue.archivedAt IS NULL
        GROUP BY a.issue.id
        ORDER BY a.issue.id
        """)
    List<Object[]> countByIssueOfProject(@Param("projectId") Long projectId);
}
