package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.ConnectorConnection;

public interface ConnectorConnectionRepository extends JpaRepository<ConnectorConnection, Long> {

    List<ConnectorConnection> findByWorkspaceId(Long workspaceId);

    Optional<ConnectorConnection> findByWorkspaceIdAndConnectorKey(Long workspaceId, String connectorKey);

    boolean existsByWorkspaceIdAndConnectorKey(Long workspaceId, String connectorKey);

    void deleteByWorkspaceIdAndConnectorKey(Long workspaceId, String connectorKey);
}
