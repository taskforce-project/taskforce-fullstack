package com.taskforce.tf_api.modules.transfer.api;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.modules.transfer.service.ProjectBundleService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;

/**
 * Fichier de projet TaskForce : téléchargement d'un projet entier, et création d'un projet à partir d'un tel fichier.
 * C'est ainsi qu'un projet passe de la webapp à l'app desktop et inversement.
 *
 * <p>Le fichier voyage tel quel, sans enveloppe {@code ApiResponse} ni formulaire multipart : le téléchargement est un
 * zip, et l'import lit le corps de la requête ({@code application/zip}), borné à {@link #MAX_UPLOAD_BYTES}, au lieu des
 * limites des envois de pièces jointes.</p>
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/projects")
@RequiredArgsConstructor
public class ProjectBundleController {

    /** Plus gros fichier de projet reçu. */
    static final long MAX_UPLOAD_BYTES = 512L * 1024 * 1024;

    static final String ZIP = "application/zip";

    private final ProjectBundleService bundleService;
    private final ProjectService projectService;
    private final UserRepository userRepository;

    @GetMapping("/{projectId}/bundle")
    public void export(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @AuthenticationPrincipal Jwt jwt,
        HttpServletResponse response
    ) throws IOException {
        ProjectBundleService.Export export = bundleService.export(slug, projectId, resolveUserId(jwt));
        response.setContentType(ZIP);
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment().filename(export.fileName()).build().toString());
        bundleService.write(export, response.getOutputStream());
    }

    @PostMapping(value = "/import", consumes = {ZIP, "application/x-zip-compressed", MediaType.APPLICATION_OCTET_STREAM_VALUE})
    public ResponseEntity<ApiResponse<ProjectResponse>> importProject(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt,
        HttpServletRequest request
    ) throws IOException {
        Long userId = resolveUserId(jwt);
        if (request.getContentLengthLong() > MAX_UPLOAD_BYTES) {
            throw new BusinessException(ProjectBundleService.TOO_LARGE);
        }
        Path file = Files.createTempFile("taskforce-project-", ".zip");
        try {
            try (InputStream in = request.getInputStream(); OutputStream out = Files.newOutputStream(file)) {
                ProjectBundleService.copyAtMost(in, out, MAX_UPLOAD_BYTES);
            }
            Long projectId = bundleService.importBundle(slug, userId, file);
            return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Project imported", projectService.getProject(slug, projectId, userId)));
        } finally {
            Files.deleteIfExists(file);
        }
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        return userRepository.findByEmail(email).map(User::getId)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }
}
