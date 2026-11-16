package com.taskforce.tf_api.modules.ged.api;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.modules.ged.dto.response.AttachmentResponse;
import com.taskforce.tf_api.modules.ged.dto.response.IssueAttachmentCount;
import com.taskforce.tf_api.modules.ged.service.AttachmentService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Routes :
 *   POST   /api/workspaces/{slug}/projects/{projectId}/issues/{issueId}/attachments
 *   GET    /api/workspaces/{slug}/projects/{projectId}/issues/{issueId}/attachments
 *   DELETE /api/workspaces/{slug}/projects/{projectId}/issues/{issueId}/attachments/{attachmentId}
 *   GET    /api/workspaces/{slug}/projects/{projectId}/attachments/counts
 *
 * <p>Le préfixe commun s'arrête au projet : le compte par issue (la vue du workflow) vit au niveau du projet, et reste
 * dans ce contrôleur, avec les autres routes des pièces jointes.</p>
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/projects/{projectId}")
@RequiredArgsConstructor
public class AttachmentController {

    private final AttachmentService attachmentService;
    private final UserRepository userRepository;

    @PostMapping(value = "/issues/{issueId}/attachments", consumes = "multipart/form-data")
    public ResponseEntity<ApiResponse<AttachmentResponse>> upload(
            @PathVariable String slug,
            @PathVariable Long projectId,
            @PathVariable Long issueId,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        AttachmentResponse response = attachmentService.upload(slug, projectId, issueId, file, userId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("File uploaded", response));
    }

    @GetMapping("/issues/{issueId}/attachments")
    public ResponseEntity<ApiResponse<List<AttachmentResponse>>> list(
            @PathVariable String slug,
            @PathVariable Long projectId,
            @PathVariable Long issueId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        // Le JWT était injecté mais jamais lu : la lecture n'était donc soumise à aucune
        // autorisation au-delà de « être authentifié ».
        Long userId = resolveUserId(jwt);
        List<AttachmentResponse> attachments = attachmentService.listByIssue(slug, projectId, issueId, userId);
        return ResponseEntity.ok(ApiResponse.success("Attachments retrieved", attachments));
    }

    @DeleteMapping("/issues/{issueId}/attachments/{attachmentId}")
    public ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable String slug,
            @PathVariable Long projectId,
            @PathVariable Long issueId,
            @PathVariable Long attachmentId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        attachmentService.delete(slug, projectId, issueId, attachmentId, userId);
        return ResponseEntity.ok(ApiResponse.success("Attachment deleted", null));
    }

    /**
     * GET /api/workspaces/{slug}/projects/{projectId}/attachments/counts : le nombre de pièces jointes de chaque issue du
     * projet, en une lecture (la vue du workflow, lot W1). Seules les issues qui en ont, sans les archivées.
     */
    @GetMapping("/attachments/counts")
    public ResponseEntity<ApiResponse<List<IssueAttachmentCount>>> countAttachmentsByIssue(
            @PathVariable String slug,
            @PathVariable Long projectId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = resolveUserId(jwt);
        return ResponseEntity.ok(ApiResponse.success("Attachment counts retrieved",
                attachmentService.countByIssue(slug, projectId, userId)));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        return user.getId();
    }
}
