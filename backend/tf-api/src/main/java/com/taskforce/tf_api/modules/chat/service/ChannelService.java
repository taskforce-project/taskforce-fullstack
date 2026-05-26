package com.taskforce.tf_api.modules.chat.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.modules.chat.domain.Channel;
import com.taskforce.tf_api.modules.chat.domain.ChannelMember;
import com.taskforce.tf_api.modules.chat.domain.ChannelMemberId;
import com.taskforce.tf_api.modules.chat.dto.request.CreateChannelRequest;
import com.taskforce.tf_api.modules.chat.dto.response.ChannelResponse;
import com.taskforce.tf_api.modules.chat.repository.ChannelMemberRepository;
import com.taskforce.tf_api.modules.chat.repository.ChannelRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ChannelService {

    private final ChannelRepository       channelRepository;
    private final ChannelMemberRepository memberRepository;
    private final WorkspaceRepository     workspaceRepository;
    private final UserRepository          userRepository;
    private final ProjectRepository       projectRepository;

    // =========================================================================
    // List
    // =========================================================================

    @Transactional(readOnly = true)
    public List<ChannelResponse> listChannels(String slug, Long userId) {
        return channelRepository.findByWorkspaceAndMember(slug, userId)
                .stream()
                .map(c -> toResponse(c, memberRepository.countById_ChannelId(c.getId())))
                .toList();
    }

    // =========================================================================
    // Create
    // =========================================================================

    @Transactional
    public ChannelResponse createChannel(String slug, Long userId, CreateChannelRequest req) {
        Workspace workspace = workspaceRepository.findBySlug(slug)
                .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        Project project = null;
        if (req.getProjectId() != null) {
            project = projectRepository.findById(req.getProjectId())
                    .orElseThrow(() -> new ResourceNotFoundException("Projet introuvable"));
        }

        Channel channel = Channel.builder()
                .workspace(workspace)
                .project(project)
                .kind(req.getKind())
                .name(req.getName())
                .description(req.getDescription())
                .isPrivate(req.getIsPrivate() != null && req.getIsPrivate())
                .createdBy(creator)
                .build();

        channelRepository.save(channel);

        // Ajouter le créateur comme membre
        addMember(channel, creator);

        // Ajouter les membres supplémentaires
        if (req.getMemberIds() != null) {
            for (Long memberId : req.getMemberIds()) {
                userRepository.findById(memberId).ifPresent(u -> addMember(channel, u));
            }
        }

        long count = memberRepository.countById_ChannelId(channel.getId());
        return toResponse(channel, count);
    }

    // =========================================================================
    // Seed — crée les canaux par défaut (#general, #announcements) d'un workspace
    // =========================================================================

    @Transactional
    public void seedDefaultChannels(Workspace workspace, User creator) {
        createDefault(workspace, creator, "general",       "Conversations générales");
        createDefault(workspace, creator, "announcements", "Annonces importantes");
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private void createDefault(Workspace workspace, User creator, String name, String description) {
        Channel channel = Channel.builder()
                .workspace(workspace)
                .kind(com.taskforce.tf_api.core.enums.ChannelKind.CHANNEL)
                .name(name)
                .description(description)
                .createdBy(creator)
                .build();
        channelRepository.save(channel);
        addMember(channel, creator);
    }

    private void addMember(Channel channel, User user) {
        var memberId = new ChannelMemberId(channel.getId(), user.getId());
        if (!memberRepository.existsById(memberId)) {
            memberRepository.save(ChannelMember.builder()
                    .id(memberId)
                    .channel(channel)
                    .user(user)
                    .build());
        }
    }

    public ChannelResponse toResponse(Channel c, long memberCount) {
        return ChannelResponse.builder()
                .id(c.getId())
                .kind(c.getKind())
                .name(c.getName())
                .description(c.getDescription())
                .isPrivate(c.getIsPrivate())
                .projectId(c.getProject() != null ? c.getProject().getId() : null)
                .projectName(c.getProject() != null ? c.getProject().getName() : null)
                .memberCount(memberCount)
                .build();
    }
}
