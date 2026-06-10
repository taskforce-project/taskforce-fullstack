package com.taskforce.tf_api.modules.chat.api;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.modules.chat.dto.request.CreateChannelRequest;
import com.taskforce.tf_api.modules.chat.dto.request.SendMessageRequest;
import com.taskforce.tf_api.modules.chat.dto.request.UpdateMessageRequest;
import com.taskforce.tf_api.modules.chat.dto.response.ChannelResponse;
import com.taskforce.tf_api.modules.chat.dto.response.ChatMessageResponse;
import com.taskforce.tf_api.modules.chat.service.ChannelService;
import com.taskforce.tf_api.modules.chat.service.ChatMessageService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/workspaces/{slug}/channels")
@RequiredArgsConstructor
public class ChannelController {

    private final ChannelService     channelService;
    private final ChatMessageService messageService;
    private final UserRepository     userRepository;

    // =========================================================================
    // Channels
    // =========================================================================

    @GetMapping
    public ResponseEntity<ApiResponse<List<ChannelResponse>>> listChannels(
            @PathVariable String slug,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
                "Canaux récupérés",
                channelService.listChannels(slug, userId)
        ));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<ChannelResponse>> createChannel(
            @PathVariable String slug,
            @Valid @RequestBody CreateChannelRequest req,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        ChannelResponse created = channelService.createChannel(slug, userId, req);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Canal créé", created));
    }

    // =========================================================================
    // Messages
    // =========================================================================

    @GetMapping("/{channelId}/messages")
    public ResponseEntity<ApiResponse<List<ChatMessageResponse>>> listMessages(
            @PathVariable String slug,
            @PathVariable Long channelId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
                "Messages récupérés",
                messageService.getMessages(channelId, userId)
        ));
    }

    @PostMapping("/{channelId}/messages")
    public ResponseEntity<ApiResponse<ChatMessageResponse>> sendMessage(
            @PathVariable String slug,
            @PathVariable Long channelId,
            @Valid @RequestBody SendMessageRequest req,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        ChatMessageResponse saved = messageService.sendMessage(channelId, userId, req);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Message envoyé", saved));
    }

    @PatchMapping("/{channelId}/messages/{messageId}")
    public ResponseEntity<ApiResponse<ChatMessageResponse>> editMessage(
            @PathVariable String slug,
            @PathVariable Long channelId,
            @PathVariable Long messageId,
            @Valid @RequestBody UpdateMessageRequest req,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        ChatMessageResponse updated = messageService.editMessage(channelId, messageId, userId, req);
        return ResponseEntity.ok(ApiResponse.success("Message modifié", updated));
    }

    @DeleteMapping("/{channelId}/messages/{messageId}")
    public ResponseEntity<ApiResponse<Void>> deleteMessage(
            @PathVariable String slug,
            @PathVariable Long channelId,
            @PathVariable Long messageId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        messageService.deleteMessage(channelId, messageId, userId);
        return ResponseEntity.ok(ApiResponse.success("Message supprimé", null));
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private Long resolveUserId(Jwt jwt) {
        return userRepository.findByKeycloakId(jwt.getSubject())
                .map(User::getId)
                .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }
}
