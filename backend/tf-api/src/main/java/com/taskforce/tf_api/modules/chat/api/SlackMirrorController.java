package com.taskforce.tf_api.modules.chat.api;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.modules.chat.service.SlackMirrorService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Miroir Slack → chat : active le miroir d'un canal Slack (crée un canal de chat dédié) et
 * déclenche une synchronisation manuelle des messages. Le poller planifié viendra ensuite.
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/integrations/slack/channels/{channelId}")
@RequiredArgsConstructor
public class SlackMirrorController {

    private final SlackMirrorService mirrorService;
    private final UserRepository     userRepository;

    /** Active le miroir : crée le canal de chat miroir + 1re synchronisation. */
    @PostMapping("/mirror")
    public ResponseEntity<ApiResponse<Map<String, Object>>> enableMirror(
        @PathVariable String slug,
        @PathVariable Long channelId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long mirrorChannelId = mirrorService.enableMirror(slug, channelId, resolveUserId(jwt));
        return ResponseEntity.ok(ApiResponse.success("Miroir Slack activé",
            Map.of("mirrorChannelId", mirrorChannelId)));
    }

    /** Synchronise (importe les nouveaux messages Slack dans le canal miroir). */
    @PostMapping("/sync")
    public ResponseEntity<ApiResponse<Map<String, Object>>> sync(
        @PathVariable String slug,
        @PathVariable Long channelId
    ) {
        int imported = mirrorService.sync(slug, channelId);
        return ResponseEntity.ok(ApiResponse.success("Synchronisation Slack effectuée",
            Map.of("imported", imported)));
    }

    private Long resolveUserId(Jwt jwt) {
        return userRepository.findByEmail(jwt.getClaimAsString("email"))
            .map(User::getId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }
}
