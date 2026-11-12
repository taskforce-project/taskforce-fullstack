package com.taskforce.tf_api.modules.storage.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.modules.storage.domain.StorageTarget;

public interface StorageTargetRepository extends JpaRepository<StorageTarget, Long> {

    /** La cible de l'espace. */
    Optional<StorageTarget> findByWorkspaceIdAndProjectIdIsNull(Long workspaceId);

    /** La cible qu'un projet a choisie pour lui. */
    Optional<StorageTarget> findByWorkspaceIdAndProjectId(Long workspaceId, Long projectId);
}
