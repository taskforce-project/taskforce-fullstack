package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.Workspace;

@Repository
public interface WorkspaceRepository extends JpaRepository<Workspace, Long> {

    Optional<Workspace> findByOwnerId(Long ownerId);

    Optional<Workspace> findBySlug(String slug);

    boolean existsBySlug(String slug);

    /** Tous les workspaces dont l'utilisateur est membre */
    @Query("SELECT wm.workspace FROM WorkspaceMember wm WHERE wm.user.id = :userId")
    List<Workspace> findAllByMemberId(@Param("userId") Long userId);

    /** Nombre de workspaces dont l'utilisateur est membre */
    @Query("SELECT COUNT(wm) FROM WorkspaceMember wm WHERE wm.user.id = :userId")
    long countByMemberId(@Param("userId") Long userId);
}
