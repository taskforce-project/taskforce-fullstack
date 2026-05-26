package com.taskforce.tf_api.core.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;

@Repository
public interface IntegrationRepository extends JpaRepository<Integration, Long> {

    Optional<Integration> findByWorkspaceIdAndProvider(Long workspaceId, IntegrationProvider provider);

    boolean existsByWorkspaceIdAndProvider(Long workspaceId, IntegrationProvider provider);

    void deleteByWorkspaceIdAndProvider(Long workspaceId, IntegrationProvider provider);
}
