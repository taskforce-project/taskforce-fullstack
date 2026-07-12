package com.taskforce.tf_api.core.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.AiTokenUsage;

public interface AiTokenUsageRepository extends JpaRepository<AiTokenUsage, Long> {

    Optional<AiTokenUsage> findByWorkspaceIdAndPeriod(Long workspaceId, String period);
}
