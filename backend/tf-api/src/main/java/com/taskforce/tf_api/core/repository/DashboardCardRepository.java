package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.DashboardCard;

public interface DashboardCardRepository extends JpaRepository<DashboardCard, Long> {

    /** Le dashboard d'un membre : toutes ses cartes du workspace, triées par position. */
    List<DashboardCard> findByWorkspaceIdAndUserIdOrderByPositionAsc(Long workspaceId, Long userId);

    /** Résolution scopée : la carte n'est visible que par SON propriétaire dans SON workspace. */
    Optional<DashboardCard> findByIdAndWorkspaceIdAndUserId(Long id, Long workspaceId, Long userId);

    /** Carte en dernière position (pour ajouter en fin de liste). */
    Optional<DashboardCard> findTopByWorkspaceIdAndUserIdOrderByPositionDesc(Long workspaceId, Long userId);
}
