package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.Workspace;

@Repository
public interface WorkspaceRepository extends JpaRepository<Workspace, Long> {

    Optional<Workspace> findByOwnerId(Long ownerId);

    /** Id du propriétaire (compte de facturation) d'un workspace, sans charger l'entité. */
    @Query("SELECT w.owner.id FROM Workspace w WHERE w.id = :workspaceId")
    Optional<Long> findOwnerIdByWorkspaceId(@Param("workspaceId") Long workspaceId);

    /** Forfait du propriétaire (compte) d'un workspace par slug — pour le gating de features par plan. */
    @Query("SELECT w.owner.planType FROM Workspace w WHERE w.slug = :slug")
    Optional<PlanType> findOwnerPlanBySlug(@Param("slug") String slug);

    Optional<Workspace> findBySlug(String slug);

    boolean existsBySlug(String slug);

    /** Tous les workspaces dont l'utilisateur est membre */
    @Query("SELECT wm.workspace FROM WorkspaceMember wm WHERE wm.user.id = :userId")
    List<Workspace> findAllByMemberId(@Param("userId") Long userId);

    /** Nombre de workspaces dont l'utilisateur est membre */
    @Query("SELECT COUNT(wm) FROM WorkspaceMember wm WHERE wm.user.id = :userId")
    long countByMemberId(@Param("userId") Long userId);

    /**
     * Nombre de workspaces POSSÉDÉS (créés) par l'utilisateur. Base du quota de création par plan :
     * distinct de {@link #countByMemberId} (qui compte aussi les workspaces où l'on est simplement
     * invité) — être invité chez d'autres ne doit PAS consommer son propre quota.
     */
    long countByOwnerId(Long ownerId);
}
