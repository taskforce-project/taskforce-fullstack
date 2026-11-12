package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.ConnectorApp;

/** Les applications d'entreprise saisies par l'administrateur d'un espace (V126, chemin C). */
public interface ConnectorAppRepository extends JpaRepository<ConnectorApp, Long> {

    Optional<ConnectorApp> findByWorkspaceIdAndConnectorKey(Long workspaceId, String connectorKey);

    List<ConnectorApp> findByWorkspaceId(Long workspaceId);
}
