package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.taskforce.tf_api.core.model.ConnectorConnection;

/**
 * Les connexions aux outils (V61, V126). Une personne ne voit et n'utilise que les siennes et celles que l'espace
 * partage ({@link #findUsable}) : jamais la connexion personnelle d'une autre.
 */
public interface ConnectorConnectionRepository extends JpaRepository<ConnectorConnection, Long> {

    /** Toutes les connexions de l'espace, toutes personnes confondues : pour l'entretien, jamais pour l'écran. */
    List<ConnectorConnection> findByWorkspaceId(Long workspaceId);

    /** Ce qu'une personne peut utiliser dans un espace : ses connexions et celles que l'espace partage. */
    @Query("select c from ConnectorConnection c where c.workspace.id = :workspaceId "
        + "and (c.owner is null or c.owner.id = :userId) order by c.id")
    List<ConnectorConnection> findUsable(@Param("workspaceId") Long workspaceId, @Param("userId") Long userId);

    /** La connexion partagée de l'espace pour cet outil. */
    Optional<ConnectorConnection> findByWorkspaceIdAndConnectorKeyAndOwnerIsNull(Long workspaceId, String connectorKey);

    /** La connexion personnelle de cette personne pour cet outil. */
    Optional<ConnectorConnection> findByWorkspaceIdAndConnectorKeyAndOwnerId(Long workspaceId, String connectorKey,
                                                                         Long ownerId);

    /** Une clé est-elle déjà prise dans l'espace, par quiconque ? (clé d'un serveur personnalisé) */
    boolean existsByWorkspaceIdAndConnectorKey(Long workspaceId, String connectorKey);
}
