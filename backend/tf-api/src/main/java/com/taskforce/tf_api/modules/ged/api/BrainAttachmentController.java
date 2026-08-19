package com.taskforce.tf_api.modules.ged.api;

import java.io.IOException;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.modules.ged.dto.response.BrainFileResponse;
import com.taskforce.tf_api.modules.ged.service.MinioService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Upload de pièces jointes du Brain OS (images, documents) vers MinIO.
 * Stockage rangé par workspace : {@code brain/{workspaceId}/{uuid}-{filename}}.
 * La lecture se fait via le proxy public {@code GET /api/files/brain/...} (cf. FileController).
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/brain")
@RequiredArgsConstructor
public class BrainAttachmentController {

    private final MinioService    minioService;
    private final UserRepository  userRepository;
    private final BrainAccessGuard access;

    @PostMapping("/files")
    public ResponseEntity<ApiResponse<BrainFileResponse>> upload(
        @AuthenticationPrincipal Jwt jwt,
        @PathVariable String slug,
        @RequestParam("file") MultipartFile file
    ) throws IOException {
        Long userId = resolveUserId(jwt);
        Workspace ws = access.resolveAndAuthorize(slug, userId);

        String original = file.getOriginalFilename() != null ? file.getOriginalFilename() : "fichier";
        String safe = original.replaceAll("[^a-zA-Z0-9._-]", "_");
        String name = UUID.randomUUID().toString().substring(0, 8) + "-" + safe;
        String key  = "brain/" + ws.getId() + "/" + name;

        String contentType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";
        minioService.upload(key, file.getInputStream(), file.getSize(), contentType);

        String url = "/api/files/brain/" + ws.getId() + "/" + name;
        boolean isImage = contentType.startsWith("image/");
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(
            "Fichier uploadé",
            new BrainFileResponse(url, original, contentType, file.getSize(), isImage)
        ));
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
