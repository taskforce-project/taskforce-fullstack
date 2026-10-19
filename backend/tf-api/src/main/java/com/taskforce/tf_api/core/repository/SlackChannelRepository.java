package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.SlackChannel;

@Repository
public interface SlackChannelRepository extends JpaRepository<SlackChannel, Long> {

    List<SlackChannel> findByWorkspaceIdOrderByCreatedAtDesc(Long workspaceId);

    void deleteByIdAndWorkspaceId(Long id, Long workspaceId);

    boolean existsByWorkspaceIdAndChannelId(Long workspaceId, String channelId);

    /** Canaux d'un workspace, supprimés avec sa connexion Slack (ils appartiennent à l'équipe Slack connectée). */
    void deleteByWorkspaceId(Long workspaceId);
}
