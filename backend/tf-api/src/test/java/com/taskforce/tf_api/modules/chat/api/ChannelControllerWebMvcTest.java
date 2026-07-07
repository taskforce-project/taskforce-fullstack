package com.taskforce.tf_api.modules.chat.api;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.enums.ChannelKind;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.modules.chat.dto.request.CreateChannelRequest;
import com.taskforce.tf_api.modules.chat.dto.request.SendMessageRequest;
import com.taskforce.tf_api.modules.chat.dto.request.UpdateMessageRequest;
import com.taskforce.tf_api.modules.chat.dto.response.ChannelResponse;
import com.taskforce.tf_api.modules.chat.dto.response.ChatMessageResponse;
import com.taskforce.tf_api.modules.chat.service.ChannelService;
import com.taskforce.tf_api.modules.chat.service.ChatMessageService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de tranche web du {@link ChannelController} via {@code @WebMvcTest}.
 * Contrats HTTP : liste/création de canaux, historique/envoi/édition/suppression de messages.
 * Services mockés. L'{@code WorkspaceAccessInterceptor} fail-open : les repos workspace restent non stubbés.
 */
@WebMvcTest(ChannelController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("ChannelController (@WebMvcTest)")
class ChannelControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private ChannelService channelService;
    @MockitoBean private ChatMessageService messageService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;
    @MockitoBean private SimpMessagingTemplate messagingTemplate;

    private static final String EMAIL = "dev@it.dev";

    private void stubUser() {
        when(userRepository.findByEmail(EMAIL))
            .thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth() {
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    private ChannelResponse channel() {
        return ChannelResponse.builder()
            .id(1L).kind(ChannelKind.PROJECT_CHANNEL).name("général")
            .isPrivate(false).memberCount(3).build();
    }

    private ChatMessageResponse message() {
        return ChatMessageResponse.builder()
            .id(10L).channelId(1L).authorId(7L).authorName("Dev")
            .authorInitials("D").content("Salut").isEdited(false).build();
    }

    // ---- Canaux -------------------------------------------------------------

    @Test
    @DisplayName("GET /channels (auth) → 200 + liste des canaux")
    void listChannels_200() throws Exception {
        stubUser();
        when(channelService.listChannels(anyString(), anyLong())).thenReturn(List.of(channel()));

        mockMvc.perform(get("/api/workspaces/acme/channels").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @DisplayName("POST /channels (auth) → 201 + canal créé")
    void createChannel_201() throws Exception {
        stubUser();
        when(channelService.createChannel(anyString(), anyLong(), any())).thenReturn(channel());

        mockMvc.perform(post("/api/workspaces/acme/channels").with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"kind\":\"PROJECT_CHANNEL\",\"name\":\"général\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true));
    }

    // ---- Messages -----------------------------------------------------------

    @Test
    @DisplayName("GET /channels/{id}/messages (auth) → 200 + historique")
    void listMessages_200() throws Exception {
        stubUser();
        when(messageService.getMessages(anyLong(), anyLong())).thenReturn(List.of(message()));

        mockMvc.perform(get("/api/workspaces/acme/channels/1/messages").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @DisplayName("POST /channels/{id}/messages (auth) → 201 + message envoyé + rediffusé sur le topic")
    void sendMessage_201() throws Exception {
        stubUser();
        ChatMessageResponse saved = message();
        when(messageService.sendMessage(anyLong(), anyLong(), any(SendMessageRequest.class)))
            .thenReturn(saved);

        mockMvc.perform(post("/api/workspaces/acme/channels/1/messages").with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"Salut\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true));

        // Temps réel : la voie REST doit publier le message sauvegardé sur /topic/channel.{id}
        // (le front envoie en REST mais s'abonne via STOMP).
        verify(messagingTemplate).convertAndSend("/topic/channel.1", (Object) saved);
    }

    @Test
    @DisplayName("PATCH /channels/{id}/messages/{msgId} (auth) → 200 + message modifié")
    void editMessage_200() throws Exception {
        stubUser();
        when(messageService.editMessage(anyLong(), anyLong(), anyLong(), any(UpdateMessageRequest.class)))
            .thenReturn(message());

        mockMvc.perform(patch("/api/workspaces/acme/channels/1/messages/10").with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"Corrigé\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @DisplayName("DELETE /channels/{id}/messages/{msgId} (auth) → 200 + suppression")
    void deleteMessage_200() throws Exception {
        stubUser();

        mockMvc.perform(delete("/api/workspaces/acme/channels/1/messages/10").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    // ---- Sécurité / validation ---------------------------------------------

    @Test
    @DisplayName("GET /channels sans JWT → 401")
    void listChannels_unauthenticated_401() throws Exception {
        mockMvc.perform(get("/api/workspaces/acme/channels"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("POST /channels/{id}/messages avec corps vide (@NotBlank) → 400")
    void sendMessage_invalidBody_400() throws Exception {
        stubUser();

        mockMvc.perform(post("/api/workspaces/acme/channels/1/messages").with(auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"\"}"))
            .andExpect(status().isBadRequest());
    }
}
