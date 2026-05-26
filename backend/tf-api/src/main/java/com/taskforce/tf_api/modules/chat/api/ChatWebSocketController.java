package com.taskforce.tf_api.modules.chat.api;

import java.security.Principal;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import com.taskforce.tf_api.modules.chat.dto.request.SendMessageRequest;
import com.taskforce.tf_api.modules.chat.dto.response.ChatMessageResponse;
import com.taskforce.tf_api.modules.chat.service.ChatMessageService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Contrôleur WebSocket STOMP.
 * Reçoit les messages envoyés par les clients via STOMP et les diffuse au canal.
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class ChatWebSocketController {

    private final ChatMessageService    messageService;
    private final SimpMessagingTemplate messagingTemplate;

    /**
     * Client envoie à : /app/channel/{channelId}/send
     * Diffusion sur   : /topic/channel.{channelId}
     */
    @MessageMapping("/channel/{channelId}/send")
    public void sendMessage(
            @DestinationVariable Long channelId,
            @Payload @Valid SendMessageRequest req,
            Principal principal
    ) {
        if (principal == null) {
            log.warn("Message rejeté : principal null sur canal {}", channelId);
            return;
        }

        Long userId;
        try {
            userId = Long.parseLong(principal.getName());
        } catch (NumberFormatException e) {
            log.warn("Principal invalide : {}", principal.getName());
            return;
        }

        ChatMessageResponse response = messageService.sendMessage(channelId, userId, req.getContent());
        messagingTemplate.convertAndSend("/topic/channel." + channelId, response);
    }
}
