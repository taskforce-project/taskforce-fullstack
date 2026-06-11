package com.taskforce.tf_api.core.api;

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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.CreateDiscussionRequest;
import com.taskforce.tf_api.core.dto.request.UpdateDiscussionRequest;
import com.taskforce.tf_api.core.dto.response.DiscussionResponse;
import com.taskforce.tf_api.core.enums.DiscussionCategory;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.DiscussionService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/workspaces/{slug}/discussions")
@RequiredArgsConstructor
public class DiscussionController {

    private final DiscussionService discussionService;
    private final UserRepository    userRepository;

    // =========================================================================
    // Discussions CRUD
    // =========================================================================

    @GetMapping
    public ResponseEntity<ApiResponse<List<DiscussionResponse>>> listDiscussions(
            @PathVariable String slug,
            @RequestParam(required = false) DiscussionCategory category
    ) {
        List<DiscussionResponse> discussions = discussionService.listDiscussions(slug, category);
        return ResponseEntity.ok(ApiResponse.success("Discussions récupérées", discussions));
    }

    @GetMapping("/{discussionId}")
    public ResponseEntity<ApiResponse<DiscussionResponse>> getDiscussion(
            @PathVariable String slug,
            @PathVariable Long discussionId
    ) {
        DiscussionResponse discussion = discussionService.getDiscussion(slug, discussionId);
        return ResponseEntity.ok(ApiResponse.success("Discussion récupérée", discussion));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<DiscussionResponse>> createDiscussion(
            @PathVariable String slug,
            @Valid @RequestBody CreateDiscussionRequest req,
            @AuthenticationPrincipal Jwt jwt
    ) {
        User user = userRepository.findByEmail(jwt.getClaimAsString("email"))
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        DiscussionResponse created = discussionService.createDiscussion(slug, user.getId(), req);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Discussion créée", created));
    }

    @PatchMapping("/{discussionId}")
    public ResponseEntity<ApiResponse<DiscussionResponse>> updateDiscussion(
            @PathVariable String slug,
            @PathVariable Long discussionId,
            @Valid @RequestBody UpdateDiscussionRequest req
    ) {
        DiscussionResponse updated = discussionService.updateDiscussion(slug, discussionId, req);
        return ResponseEntity.ok(ApiResponse.success("Discussion mise à jour", updated));
    }

    @DeleteMapping("/{discussionId}")
    public ResponseEntity<ApiResponse<Void>> deleteDiscussion(
            @PathVariable String slug,
            @PathVariable Long discussionId
    ) {
        discussionService.deleteDiscussion(slug, discussionId);
        return ResponseEntity.ok(ApiResponse.success("Discussion supprimée", null));
    }

    // =========================================================================
    // Pin / Lock
    // =========================================================================

    @PatchMapping("/{discussionId}/pin")
    public ResponseEntity<ApiResponse<DiscussionResponse>> togglePin(
            @PathVariable String slug,
            @PathVariable Long discussionId
    ) {
        DiscussionResponse updated = discussionService.togglePin(slug, discussionId);
        return ResponseEntity.ok(ApiResponse.success("Épinglage mis à jour", updated));
    }

    @PatchMapping("/{discussionId}/lock")
    public ResponseEntity<ApiResponse<DiscussionResponse>> toggleLock(
            @PathVariable String slug,
            @PathVariable Long discussionId
    ) {
        DiscussionResponse updated = discussionService.toggleLock(slug, discussionId);
        return ResponseEntity.ok(ApiResponse.success("Verrouillage mis à jour", updated));
    }
}
