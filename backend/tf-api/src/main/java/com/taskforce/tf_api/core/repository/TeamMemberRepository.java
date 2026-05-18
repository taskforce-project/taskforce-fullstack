package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.TeamMember;

public interface TeamMemberRepository extends JpaRepository<TeamMember, Long> {

    List<TeamMember> findByTeamId(Long teamId);

    Optional<TeamMember> findByTeamIdAndUserId(Long teamId, Long userId);

    boolean existsByTeamIdAndUserId(Long teamId, Long userId);

    void deleteByTeamIdAndUserId(Long teamId, Long userId);

    long countByTeamId(Long teamId);
}
