package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.Team;

public interface TeamRepository extends JpaRepository<Team, Long> {

    List<Team> findByWorkspaceIdOrderByUpdatedAtDesc(Long workspaceId);

    boolean existsByIdAndWorkspaceId(Long id, Long workspaceId);
}
