package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.ProjectTeam;

@Repository
public interface ProjectTeamRepository extends JpaRepository<ProjectTeam, Long> {

    List<ProjectTeam> findByProjectId(Long projectId);

    List<ProjectTeam> findByTeamId(Long teamId);

    boolean existsByProjectIdAndTeamId(Long projectId, Long teamId);

    void deleteByProjectIdAndTeamId(Long projectId, Long teamId);
}
