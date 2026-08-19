package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.Webhook;

@Repository
public interface WebhookRepository extends JpaRepository<Webhook, Long> {

    List<Webhook> findByWorkspaceIdAndActiveTrue(Long workspaceId);

    List<Webhook> findByWorkspaceIdOrderByCreatedAtDesc(Long workspaceId);

    void deleteByIdAndWorkspaceId(Long id, Long workspaceId);
}
