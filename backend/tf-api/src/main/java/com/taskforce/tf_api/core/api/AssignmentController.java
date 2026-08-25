package com.taskforce.tf_api.core.api;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Acceptation / refus d'une assignation de tâche, par l'assigné courant.
 * Route : /api/me/assignments/{issueId}/(accept|decline)
 */
@RestController
@RequestMapping("/api/me/assignments")
@RequiredArgsConstructor
public class AssignmentController {

    private final IssueService issueService;
    private final UserRepository userRepository;

    @PostMapping("/{issueId}/accept")
    public ResponseEntity<ApiResponse<IssueResponse>> accept(
        @PathVariable Long issueId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Assignation acceptée", issueService.acceptAssignment(issueId, userId)));
    }

    @PostMapping("/{issueId}/decline")
    public ResponseEntity<ApiResponse<IssueResponse>> decline(
        @PathVariable Long issueId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            "Assignation refusée", issueService.declineAssignment(issueId, userId)));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
