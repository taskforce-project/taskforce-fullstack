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

import com.taskforce.tf_api.core.dto.response.WorkspaceResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.WorkspaceService;
import com.taskforce.tf_api.modules.transfer.service.ProjectBundleService;
import com.taskforce.tf_api.modules.transfer.service.WorkspaceBundleService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;

/**
 * Fichier d'espace TaskForce : téléchargement d'un espace entier (son Brain OS et tous ses projets), et création d'un
 * nouvel espace à partir d'un tel fichier. C'est ainsi que tout le travail d'une personne passe de la webapp à l'app
 * desktop et inversement. Comme pour un projet, le fichier voyage tel quel ({@code application/zip}).
 */
@RestController
@RequestMapping("/api/workspaces")
@RequiredArgsConstructor
public class WorkspaceBundleController {

    private final WorkspaceBundleService bundleService;
    private final WorkspaceService workspaceService;
    private final UserRepository userRepository;

    @GetMapping("/{slug}/bundle")
    public void export(@PathVariable String slug, @AuthenticationPrincipal Jwt jwt, HttpServletResponse response)
        throws IOException {
        WorkspaceBundleService.Export export = bundleService.export(slug, resolveUserId(jwt));
        response.setContentType(ProjectBundleController.ZIP);
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment().filename(export.fileName()).build().toString());
        bundleService.write(export, response.getOutputStream());
    }

    @PostMapping(value = "/import", consumes = {ProjectBundleController.ZIP, "application/x-zip-compressed",
        MediaType.APPLICATION_OCTET_STREAM_VALUE})
    public ResponseEntity<ApiResponse<WorkspaceResponse>> importWorkspace(@AuthenticationPrincipal Jwt jwt,
                                                                        HttpServletRequest request) throws IOException {
        Long userId = resolveUserId(jwt);
        Workspace workspace = receive(request, file -> bundleService.importBundle(userId, file));
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Workspace imported", workspaceService.getWorkspaceBySlug(workspace.getSlug(), userId)));
    }

    /** Ce que l'import fait du fichier reçu. */
    @FunctionalInterface
    interface Receiver<T> {
        T apply(Path file);
    }

    /** Copie le corps de la requête dans un fichier temporaire borné, le passe à l'import, puis l'efface. */
    static <T> T receive(HttpServletRequest request, Receiver<T> receiver) throws IOException {
        if (request.getContentLengthLong() > ProjectBundleController.MAX_UPLOAD_BYTES) {
            throw new BusinessException(ProjectBundleService.TOO_LARGE);
        }
        Path file = Files.createTempFile("taskforce-workspace-", ".zip");
        try {
            try (InputStream in = request.getInputStream(); OutputStream out = Files.newOutputStream(file)) {
                ProjectBundleService.copyAtMost(in, out, ProjectBundleController.MAX_UPLOAD_BYTES);
            }
            return receiver.apply(file);
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
