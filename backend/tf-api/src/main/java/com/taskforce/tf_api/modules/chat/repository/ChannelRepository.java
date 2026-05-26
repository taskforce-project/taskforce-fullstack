package com.taskforce.tf_api.modules.chat.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.modules.chat.domain.Channel;

@Repository
public interface ChannelRepository extends JpaRepository<Channel, Long> {

    /**
     * Channels du workspace où l'utilisateur est membre.
     */
    @Query("""
        SELECT c FROM Channel c
        JOIN ChannelMember cm ON cm.id.channelId = c.id
        WHERE c.workspace.slug = :slug
          AND cm.id.userId    = :userId
          AND c.isArchived    = false
        ORDER BY c.kind, c.name
        """)
    List<Channel> findByWorkspaceAndMember(@Param("slug") String slug,
                                           @Param("userId") Long userId);
}
