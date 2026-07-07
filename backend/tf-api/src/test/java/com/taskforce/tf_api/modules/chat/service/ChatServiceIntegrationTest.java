package com.taskforce.tf_api.modules.chat.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;

import com.taskforce.tf_api.core.enums.ChannelKind;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.modules.chat.dto.request.CreateChannelRequest;
import com.taskforce.tf_api.modules.chat.dto.response.ChannelResponse;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests d'intégration — {@link ChannelService} + {@link ChatMessageService} (repos réels).
 * Création de canal (créateur membre), listing, envoi/lecture/suppression de messages.
 */
@DisplayName("Chat (Channel + ChatMessage) — intégration Postgres")
@Import({ChannelService.class, ChatMessageService.class})
class ChatServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private ChannelService channelService;
    @Autowired private ChatMessageService chatMessageService;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;

    private static final String SLUG = "ws-chat-it";
    private User owner;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-chat").email("chat@it.dev").displayName("Owner").isActive(true).build());
        workspaceRepository.save(Workspace.builder().name("Chat WS").slug(SLUG).owner(owner).build());
    }

    private ChannelResponse createChannel(String name) {
        CreateChannelRequest r = new CreateChannelRequest();
        r.setKind(ChannelKind.CHANNEL);
        r.setName(name);
        return channelService.createChannel(SLUG, owner.getId(), r);
    }

    @Test
    @DisplayName("createChannel ajoute le créateur ; listChannels le voit")
    void should_create_and_list_channel() {
        ChannelResponse ch = createChannel("general");

        assertThat(ch.getName()).isEqualTo("general");
        assertThat(ch.getMemberCount()).isEqualTo(1);
        assertThat(channelService.listChannels(SLUG, owner.getId())).isNotEmpty();
    }

    @Test
    @DisplayName("sendMessage / getMessages / deleteMessage")
    void should_send_get_delete_message() {
        ChannelResponse ch = createChannel("random");

        var msg = chatMessageService.sendMessage(ch.getId(), owner.getId(), "Salut l'équipe");
        assertThat(chatMessageService.getMessages(ch.getId(), owner.getId())).hasSize(1);

        chatMessageService.deleteMessage(ch.getId(), msg.getId(), owner.getId());
        assertThat(chatMessageService.getMessages(ch.getId(), owner.getId())).isEmpty();
    }

    @Test
    @DisplayName("seedDefaultChannels crée les canaux par défaut")
    void should_seed_default_channels() {
        Workspace ws = workspaceRepository.findBySlug(SLUG).orElseThrow();
        channelService.seedDefaultChannels(ws, owner);

        assertThat(channelService.listChannels(SLUG, owner.getId())).isNotEmpty();
    }
}
