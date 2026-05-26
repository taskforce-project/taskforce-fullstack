package com.taskforce.tf_api.modules.chat.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.modules.chat.domain.ChannelMember;
import com.taskforce.tf_api.modules.chat.domain.ChannelMemberId;

@Repository
public interface ChannelMemberRepository extends JpaRepository<ChannelMember, ChannelMemberId> {

    boolean existsById_ChannelIdAndId_UserId(Long channelId, Long userId);

    List<ChannelMember> findById_ChannelId(Long channelId);

    long countById_ChannelId(Long channelId);
}
