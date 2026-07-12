package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.ProjectMember;

@Repository
public interface ProjectMemberRepository extends JpaRepository<ProjectMember, Long> {

    List<ProjectMember> findByProjectId(Long projectId);

    Optional<ProjectMember> findByProjectIdAndUserId(Long projectId, Long userId);

    boolean existsByProjectIdAndUserId(Long projectId, Long userId);

    void deleteByProjectIdAndUserId(Long projectId, Long userId);

    long countByProjectId(Long projectId);

    /** Ids des projets dont l'utilisateur est membre (tous workspaces) — pour filtrer la visibilité. */
    @Query("SELECT pm.project.id FROM ProjectMember pm WHERE pm.user.id = :userId")
    List<Long> findProjectIdsByUserId(@Param("userId") Long userId);
}
