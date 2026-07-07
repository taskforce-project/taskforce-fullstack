package com.taskforce.tf_api.modules.chat.service;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.taskforce.tf_api.core.dto.response.SlackHistoryMessage;
import com.taskforce.tf_api.core.model.SlackChannel;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.SlackChannelRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.SlackIntegrationService;
import com.taskforce.tf_api.modules.chat.repository.ChannelRepository;
import com.taskforce.tf_api.modules.chat.repository.ChatMessageRepository;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests d'intégration — {@link SlackMirrorService} contre un vrai Postgres.
 * L'API Slack ({@link SlackIntegrationService}) est mockée : on contrôle l'historique renvoyé
 * et on vérifie l'import (canal miroir, messages externes, curseur), la déduplication et le broadcast.
 */
@DisplayName("SlackMirrorService (intégration Postgres)")
@Import({SlackMirrorService.class, ChatMessageService.class})
class SlackMirrorServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private SlackMirrorService     mirrorService;
    @Autowired private UserRepository         userRepository;
    @Autowired private WorkspaceRepository    workspaceRepository;
    @Autowired private SlackChannelRepository slackChannelRepository;
    @Autowired private ChannelRepository      channelRepository;
    @Autowired private ChatMessageRepository  messageRepository;

    @MockitoBean private SlackIntegrationService slackService;
    @MockitoBean private SimpMessagingTemplate   messagingTemplate;

    private static final String SLUG = "ws-mirror-it";
    private User owner;
    private Workspace ws;
    private SlackChannel slackChannel;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-mirror").email("mirror@it.dev").displayName("Owner").isActive(true).build());
        ws = workspaceRepository.save(Workspace.builder().name("Mirror WS").slug(SLUG).owner(owner).build());
        slackChannel = slackChannelRepository.save(SlackChannel.builder()
            .workspace(ws).channelId("C777").channelName("general").active(true).build());
    }

    @Test
    @DisplayName("enableMirror crée le canal miroir et importe l'historique Slack (source + auteur externe)")
    void enable_mirror_imports_history() {
        when(slackService.fetchHistory(eq(ws.getId()), eq("C777"), any()))
            .thenReturn(List.of(new SlackHistoryMessage("100", "U1", "Bonjour"),
                                new SlackHistoryMessage("200", "U2", "Salut")));
        when(slackService.resolveUserName(eq(ws.getId()), any())).thenReturn("Alice");

        Long mirrorChannelId = mirrorService.enableMirror(SLUG, slackChannel.getId(), owner.getId());

        assertThat(mirrorChannelId).isNotNull();
        assertThat(slackChannelRepository.findById(slackChannel.getId()).orElseThrow().getMirrorChannelId())
            .isEqualTo(mirrorChannelId);
        assertThat(channelRepository.findById(mirrorChannelId)).isPresent();

        var msgs = messageRepository.findRecentByChannel(mirrorChannelId, PageRequest.of(0, 50));
        assertThat(msgs).hasSize(2);
        assertThat(msgs).allSatisfy(m -> {
            assertThat(m.getExternalSource()).isEqualTo("SLACK");
            assertThat(m.getAuthor()).isNull();
            assertThat(m.getExternalAuthor()).isEqualTo("Alice");
        });
        // curseur avancé au ts max, et broadcast temps réel des 2 messages
        assertThat(slackChannelRepository.findById(slackChannel.getId()).orElseThrow().getLastSyncTs()).isEqualTo("200");
        verify(messagingTemplate, times(2)).convertAndSend(startsWith("/topic/channel."), any(Object.class));
    }

    @Test
    @DisplayName("sync est idempotent : les messages déjà importés sont dédupliqués (0 réimport)")
    void sync_dedups() {
        when(slackService.fetchHistory(eq(ws.getId()), eq("C777"), any()))
            .thenReturn(List.of(new SlackHistoryMessage("100", "U1", "Bonjour")));
        when(slackService.resolveUserName(eq(ws.getId()), any())).thenReturn("Alice");

        mirrorService.enableMirror(SLUG, slackChannel.getId(), owner.getId()); // importe 1
        int again = mirrorService.sync(SLUG, slackChannel.getId());            // même historique → 0

        assertThat(again).isZero();
        Long mirrorChannelId = slackChannelRepository.findById(slackChannel.getId()).orElseThrow().getMirrorChannelId();
        assertThat(messageRepository.findRecentByChannel(mirrorChannelId, PageRequest.of(0, 50))).hasSize(1);
    }
}
