package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.SlackChannel;

@Repository
public interface SlackChannelRepository extends JpaRepository<SlackChannel, Long> {

    List<SlackChannel> findByWorkspaceIdOrderByCreatedAtDesc(Long workspaceId);

    void deleteByIdAndWorkspaceId(Long id, Long workspaceId);
}
