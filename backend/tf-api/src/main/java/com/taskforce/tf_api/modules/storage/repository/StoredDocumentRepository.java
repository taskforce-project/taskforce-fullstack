package com.taskforce.tf_api.modules.storage.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.modules.storage.domain.StoredDocument;

public interface StoredDocumentRepository extends JpaRepository<StoredDocument, Long> {

    /** Les derniers documents rangés dans l'espace. */
    List<StoredDocument> findTop100ByWorkspaceIdOrderByCreatedAtDesc(Long workspaceId);

    /** Les derniers documents rangés pour un projet. */
    List<StoredDocument> findTop50ByWorkspaceIdAndProjectIdOrderByCreatedAtDesc(Long workspaceId, Long projectId);

    Optional<StoredDocument> findByIdAndWorkspaceId(Long id, Long workspaceId);
}
