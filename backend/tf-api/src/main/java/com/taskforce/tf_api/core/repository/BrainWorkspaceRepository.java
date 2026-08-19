package com.taskforce.tf_api.core.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.BrainWorkspace;

@Repository
public interface BrainWorkspaceRepository extends JpaRepository<BrainWorkspace, Long> {

    Optional<BrainWorkspace> findByWorkspaceId(Long workspaceId);

    boolean existsByWorkspaceId(Long workspaceId);
}
