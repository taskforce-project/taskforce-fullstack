package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.enums.ProjectStatus;
import com.taskforce.tf_api.core.model.Project;

@Repository
public interface ProjectRepository extends JpaRepository<Project, Long> {

    /** Tous les projets d'un workspace (tous statuts) */
    List<Project> findByWorkspaceIdOrderByCreatedAtDesc(Long workspaceId);

    /** Projets d'un workspace filtrés par statut */
    List<Project> findByWorkspaceIdAndStatusOrderByCreatedAtDesc(Long workspaceId, ProjectStatus status);

    /** Vérifier l'existence d'un identifiant dans un workspace */
    boolean existsByWorkspaceIdAndIdentifier(Long workspaceId, String identifier);

    /** Projets dont l'utilisateur est membre (via project_members) */
    @Query("""
        SELECT pm.project FROM ProjectMember pm
        WHERE pm.project.workspace.id = :workspaceId
          AND pm.user.id = :userId
        ORDER BY pm.project.createdAt DESC
        """)
    List<Project> findByWorkspaceIdAndMemberId(
        @Param("workspaceId") Long workspaceId,
        @Param("userId") Long userId
    );

    Optional<Project> findByIdAndWorkspaceId(Long id, Long workspaceId);

    /** Compte les projets actifs d'un workspace */
    long countByWorkspaceIdAndStatus(Long workspaceId, ProjectStatus status);
}
