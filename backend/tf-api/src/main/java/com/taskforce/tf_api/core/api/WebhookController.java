package com.taskforce.tf_api.core.api;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.WebhookRequest;
import com.taskforce.tf_api.core.dto.response.WebhookResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.WebhookService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/workspaces/{slug}/webhooks")
@RequiredArgsConstructor
public class WebhookController {

    private final WebhookService webhookService;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<ApiResponse<List<WebhookResponse>>> list(@PathVariable String slug) {
        return ResponseEntity.ok(ApiResponse.success(webhookService.list(slug)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<WebhookResponse>> create(
        @PathVariable String slug,
        @Valid @RequestBody WebhookRequest req,
        @AuthenticationPrincipal Jwt jwt
    ) {
        User user = resolveUser(jwt);
        WebhookResponse webhook = webhookService.create(slug, req, user);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Webhook créé", webhook));
    }

    @PutMapping("/{webhookId}")
    public ResponseEntity<ApiResponse<WebhookResponse>> update(
        @PathVariable String slug,
        @PathVariable Long webhookId,
        @Valid @RequestBody WebhookRequest req
    ) {
        return ResponseEntity.ok(ApiResponse.success("Webhook mis à jour", webhookService.update(slug, webhookId, req)));
    }

    @DeleteMapping("/{webhookId}")
    public ResponseEntity<ApiResponse<Void>> delete(
        @PathVariable String slug,
        @PathVariable Long webhookId
    ) {
        webhookService.delete(slug, webhookId);
        return ResponseEntity.ok(ApiResponse.success("Webhook supprimé", null));
    }

    private User resolveUser(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        return userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }
}
