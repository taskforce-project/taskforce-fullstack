package com.taskforce.tf_api.modules.chat.api;

import java.security.Principal;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import com.taskforce.tf_api.modules.chat.dto.request.SendMessageRequest;
import com.taskforce.tf_api.modules.chat.dto.response.ChatMessageResponse;
import com.taskforce.tf_api.modules.chat.service.ChatMessageService;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires du {@link ChatWebSocketController} (contrôleur STOMP, non atteignable via MockMvc).
 * Vérifie l'enregistrement du message et sa diffusion sur le topic, ainsi que les branches de rejet
 * (principal null / principal non numérique).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("ChatWebSocketController (unitaire)")
class ChatWebSocketControllerTest {

    @Mock private ChatMessageService messageService;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @InjectMocks private ChatWebSocketController controller;

    private SendMessageRequest request(String content) {
        SendMessageRequest req = new SendMessageRequest();
        req.setContent(content);
        return req;
    }

    @Test
    @DisplayName("sendMessage : principal valide → enregistre et diffuse sur /topic/channel.{id}")
    void sendMessage_broadcasts() {
        ChatMessageResponse saved = ChatMessageResponse.builder()
            .id(10L).channelId(1L).authorId(42L).content("Salut").build();
        when(messageService.sendMessage(eq(1L), eq(42L), eq("Salut"))).thenReturn(saved);

        Principal principal = () -> "42";
        controller.sendMessage(1L, request("Salut"), principal);

        verify(messageService).sendMessage(1L, 42L, "Salut");
        verify(messagingTemplate).convertAndSend("/topic/channel.1", saved);
    }

    @Test
    @DisplayName("sendMessage : principal null → aucun envoi ni diffusion")
    void sendMessage_nullPrincipal_ignored() {
        controller.sendMessage(1L, request("Salut"), null);

        verifyNoInteractions(messageService);
        verifyNoInteractions(messagingTemplate);
    }

    @Test
    @DisplayName("sendMessage : principal non numérique → aucun envoi ni diffusion")
    void sendMessage_invalidPrincipal_ignored() {
        Principal principal = () -> "not-a-number";
        controller.sendMessage(1L, request("Salut"), principal);

        verify(messageService, never()).sendMessage(anyLong(), anyLong(), org.mockito.ArgumentMatchers.anyString());
        verifyNoInteractions(messagingTemplate);
    }
}
