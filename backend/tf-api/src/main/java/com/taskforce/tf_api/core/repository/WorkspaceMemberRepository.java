package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.WorkspaceMember;

@Repository
public interface WorkspaceMemberRepository extends JpaRepository<WorkspaceMember, Long> {

    @Query("SELECT m FROM WorkspaceMember m JOIN FETCH m.user WHERE m.workspace.id = :workspaceId")
    List<WorkspaceMember> findByWorkspaceId(@Param("workspaceId") Long workspaceId);

    Optional<WorkspaceMember> findByWorkspaceIdAndUserId(Long workspaceId, Long userId);

    @Query("SELECT m FROM WorkspaceMember m JOIN FETCH m.workspace WHERE m.user.id = :userId")
    List<WorkspaceMember> findByUserId(@Param("userId") Long userId);

    boolean existsByWorkspaceIdAndUserId(Long workspaceId, Long userId);

    boolean existsByWorkspaceIdAndUserEmail(Long workspaceId, String email);

    @Query("SELECT COUNT(m) FROM WorkspaceMember m WHERE m.workspace.slug = :slug")
    long countByWorkspaceSlug(@Param("slug") String slug);

    /** Nb de membres distincts (= sièges facturables) sur tous les workspaces d'un propriétaire. */
    @Query("SELECT COUNT(DISTINCT m.user.id) FROM WorkspaceMember m WHERE m.workspace.owner.id = :ownerId")
    long countDistinctMembersByOwnerId(@Param("ownerId") Long ownerId);
}
