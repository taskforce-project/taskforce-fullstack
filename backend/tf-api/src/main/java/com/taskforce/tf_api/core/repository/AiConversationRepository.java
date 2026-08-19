package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.AiConversation;

public interface AiConversationRepository extends JpaRepository<AiConversation, Long> {

    List<AiConversation> findByWorkspaceIdAndUserIdOrderByUpdatedAtDesc(Long workspaceId, Long userId);

    Optional<AiConversation> findByIdAndUserId(Long id, Long userId);
}
