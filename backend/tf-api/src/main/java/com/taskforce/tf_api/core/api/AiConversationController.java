package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.ConversationDtos.ConversationDetail;
import com.taskforce.tf_api.core.dto.response.ConversationDtos.ConversationSummary;
import com.taskforce.tf_api.core.model.AiConversation;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.AiConversationService;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Conversations Cortex (multi-conversation + historique).
 * /api/workspaces/{slug}/ai/conversations
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/ai/conversations")
@RequiredArgsConstructor
public class AiConversationController {

    private final AiConversationService service;
    private final BrainAccessGuard access;
    private final UserRepository userRepository;

    private record Ctx(Long workspaceId, Long userId) {}

    private Ctx ctx(String slug, Jwt jwt) {
        User user = userRepository.findByEmail(jwt.getClaimAsString("email"))
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        Workspace ws = access.resolveAndAuthorize(slug, user.getId());
        return new Ctx(ws.getId(), user.getId());
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<ConversationSummary>>> list(
        @PathVariable String slug, @AuthenticationPrincipal Jwt jwt) {
        Ctx c = ctx(slug, jwt);
        return ResponseEntity.ok(ApiResponse.success(service.list(c.workspaceId(), c.userId())));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<ConversationSummary>> create(
        @PathVariable String slug, @AuthenticationPrincipal Jwt jwt) {
        Ctx c = ctx(slug, jwt);
        AiConversation conv = service.create(c.workspaceId(), c.userId(), null);
        return ResponseEntity.ok(ApiResponse.success(new ConversationSummary(
            conv.getId(), conv.getTitle(),
            conv.getUpdatedAt() != null ? conv.getUpdatedAt().toString() : null, 0, 0)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ConversationDetail>> detail(
        @PathVariable String slug, @PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        Ctx c = ctx(slug, jwt);
        return ResponseEntity.ok(ApiResponse.success(service.detail(id, c.userId())));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Boolean>> delete(
        @PathVariable String slug, @PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        Ctx c = ctx(slug, jwt);
        service.delete(id, c.userId());
        return ResponseEntity.ok(ApiResponse.success(Boolean.TRUE));
    }
}
