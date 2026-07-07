package com.taskforce.tf_api.core.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.SlackChannel;

@Repository
public interface SlackChannelRepository extends JpaRepository<SlackChannel, Long> {

    List<SlackChannel> findByWorkspaceIdOrderByCreatedAtDesc(Long workspaceId);

    void deleteByIdAndWorkspaceId(Long id, Long workspaceId);

    /** Ids des canaux Slack actifs ayant un miroir configuré (utilisé par le poller). */
    @Query("select s.id from SlackChannel s where s.mirrorChannelId is not null and s.active = true")
    List<Long> findMirroredChannelIds();
}
