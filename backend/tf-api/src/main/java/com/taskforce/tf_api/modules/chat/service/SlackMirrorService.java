package com.taskforce.tf_api.modules.chat.service;

import java.util.List;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.SlackHistoryMessage;
import com.taskforce.tf_api.core.enums.ChannelKind;
import com.taskforce.tf_api.core.model.SlackChannel;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.SlackChannelRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.SlackIntegrationService;
import com.taskforce.tf_api.modules.chat.domain.Channel;
import com.taskforce.tf_api.modules.chat.domain.ChannelMember;
import com.taskforce.tf_api.modules.chat.domain.ChannelMemberId;
import com.taskforce.tf_api.modules.chat.domain.ChatMessage;
import com.taskforce.tf_api.modules.chat.repository.ChannelMemberRepository;
import com.taskforce.tf_api.modules.chat.repository.ChannelRepository;
import com.taskforce.tf_api.modules.chat.repository.ChatMessageRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Miroir Slack → chat TaskForce : importe les messages d'un canal Slack dans un canal de chat
 * TaskForce dédié et les rediffuse en temps réel (réutilise {@code /topic/channel.{id}}).
 *
 * <p>Vit dans {@code modules.chat} : il écrit dans le chat ({@code Channel}/{@code ChatMessage})
 * en s'appuyant sur {@code core} ({@code SlackChannel}/{@code SlackIntegrationService}) —
 * sens de dépendance autorisé (shared ← core ← modules).</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SlackMirrorService {

    private final SlackChannelRepository  slackChannelRepository;
    private final SlackIntegrationService slackService;
    private final ChannelRepository       channelRepository;
    private final ChannelMemberRepository memberRepository;
    private final ChatMessageRepository   messageRepository;
    private final ChatMessageService      messageService;
    private final WorkspaceRepository     workspaceRepository;
    private final UserRepository          userRepository;
    private final SimpMessagingTemplate   messagingTemplate;

    /**
     * Active le miroir d'un canal Slack : crée (idempotent) le canal de chat miroir, ajoute
     * l'utilisateur comme membre, puis lance une première synchronisation.
     * @return l'id du canal de chat miroir
     */
    @Transactional
    public Long enableMirror(String workspaceSlug, Long slackChannelDbId, Long userId) {
        Workspace ws = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
        SlackChannel sc = resolveScoped(slackChannelDbId, ws.getId());
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        if (sc.getMirrorChannelId() == null) {
            Channel channel = channelRepository.save(Channel.builder()
                .workspace(ws)
                .kind(ChannelKind.CHANNEL)
                .name("slack-" + sc.getChannelName())
                .description("Miroir du canal Slack #" + sc.getChannelName())
                .createdBy(user)
                .build());
            addMember(channel, user);
            sc.setMirrorChannelId(channel.getId());
            slackChannelRepository.save(sc);
        } else {
            channelRepository.findById(sc.getMirrorChannelId()).ifPresent(ch -> addMember(ch, user));
        }
        syncChannel(sc);
        return sc.getMirrorChannelId();
    }

    /** Synchronisation manuelle d'un canal Slack (scopée workspace). @return nb de messages importés. */
    @Transactional
    public int sync(String workspaceSlug, Long slackChannelDbId) {
        Workspace ws = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
        return syncChannel(resolveScoped(slackChannelDbId, ws.getId()));
    }

    /**
     * Sync d'un canal miroir par son id, dans une transaction dédiée (appelé par le poller —
     * l'échec d'un canal n'affecte pas les autres). No-op si le canal a disparu.
     */
    @Transactional
    public int syncMirrored(Long slackChannelDbId) {
        return slackChannelRepository.findById(slackChannelDbId).map(this::syncChannel).orElse(0);
    }

    /** Importe les nouveaux messages Slack dans le canal miroir + broadcast temps réel. */
    int syncChannel(SlackChannel sc) {
        if (sc.getMirrorChannelId() == null) return 0;
        Channel channel = channelRepository.findById(sc.getMirrorChannelId()).orElse(null);
        if (channel == null) return 0;

        Long wsId = sc.getWorkspace().getId();
        List<SlackHistoryMessage> history = slackService.fetchHistory(wsId, sc.getChannelId(), sc.getLastSyncTs());

        int imported = 0;
        String maxTs = sc.getLastSyncTs();
        for (SlackHistoryMessage msg : history) {
            if (messageRepository.existsByChannel_IdAndExternalId(channel.getId(), msg.ts())) continue;
            ChatMessage saved = messageRepository.save(ChatMessage.builder()
                .channel(channel)
                .content(msg.text())
                .externalSource("SLACK")
                .externalId(msg.ts())
                .externalAuthor(slackService.resolveUserName(wsId, msg.userId()))
                .build());
            messagingTemplate.convertAndSend("/topic/channel." + channel.getId(), messageService.toResponse(saved));
            imported++;
            if (maxTs == null || msg.ts().compareTo(maxTs) > 0) maxTs = msg.ts();
        }
        if (maxTs != null && !maxTs.equals(sc.getLastSyncTs())) {
            sc.setLastSyncTs(maxTs);
            slackChannelRepository.save(sc);
        }
        log.info("Miroir Slack : {} message(s) importé(s) → canal {} (Slack {})",
            imported, channel.getId(), sc.getChannelId());
        return imported;
    }

    private SlackChannel resolveScoped(Long slackChannelDbId, Long workspaceId) {
        return slackChannelRepository.findById(slackChannelDbId)
            .filter(c -> c.getWorkspace().getId().equals(workspaceId))
            .orElseThrow(() -> new ResourceNotFoundException("Canal Slack introuvable"));
    }

    private void addMember(Channel channel, User user) {
        var id = new ChannelMemberId(channel.getId(), user.getId());
        if (!memberRepository.existsById(id)) {
            memberRepository.save(ChannelMember.builder().id(id).channel(channel).user(user).build());
        }
    }
}
