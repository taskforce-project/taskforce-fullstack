package com.taskforce.tf_api.modules.transfer.api;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.DesktopSessionTokenRequest;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.DesktopSessionService;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.modules.transfer.dto.DesktopTransferRequest;
import com.taskforce.tf_api.modules.transfer.dto.WebProjectsResponse;
import com.taskforce.tf_api.modules.transfer.service.ProjectBundleService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.BusinessException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Déplacement de projets entre la webapp et l'app desktop, à la demande de l'app : elle liste les projets de la
 * personne, en télécharge un pour l'importer sur l'ordinateur, ou envoie un projet de l'ordinateur dans un espace.
 *
 * <p>L'app n'a pas de jeton Keycloak, seulement sa session ({@code tfa_}), qui ne vaut que sous
 * {@code /api/auth/desktop} : elle passe dans le corps des demandes, ou dans l'en-tête {@value #SESSION_HEADER} quand
 * le corps est le fichier. Les droits sont ceux de la personne : elle ne télécharge que ce qu'elle voit, et n'envoie
 * que dans un espace dont elle est membre.</p>
 */
@RestController
@Profile("!desktop")
@RequestMapping("/api/auth/desktop/transfer")
@RequiredArgsConstructor
public class DesktopTransferController {

    static final String SESSION_HEADER = "X-TaskForce-Session";

    private final DesktopSessionService sessions;
    private final ProjectBundleService bundleService;
    private final ProjectService projectService;
    private final WorkspaceRepository workspaceRepository;

    /** POST /api/auth/desktop/transfer/projects : les espaces de la personne et les projets qu'elle y voit. */
    @PostMapping("/projects")
    public ResponseEntity<ApiResponse<WebProjectsResponse>> projects(@Valid @RequestBody DesktopSessionTokenRequest request) {
        Long userId = userOf(request.token());
        List<WebProjectsResponse.WebWorkspace> workspaces = workspaceRepository.findAllByMemberId(userId).stream()
            .map(workspace -> new WebProjectsResponse.WebWorkspace(workspace.getSlug(), workspace.getName(),
                projectService.listProjects(workspace.getSlug(), userId).stream()
                    .map(project -> new WebProjectsResponse.WebProject(project.getId(), project.getName(),
                        project.getIdentifier(), project.getTotalIssues()))
                    .toList()))
            .toList();
        return ResponseEntity.ok(ApiResponse.success("Projects", new WebProjectsResponse(workspaces)));
    }

    /** POST /api/auth/desktop/transfer/bundle : le fichier d'un projet que la personne voit. */
    @PostMapping("/bundle")
    public void bundle(@Valid @RequestBody DesktopTransferRequest request, HttpServletResponse response) throws IOException {
        ProjectBundleService.Export export = bundleService.export(request.workspace(), request.projectId(),
            userOf(request.token()));
        response.setContentType(ProjectBundleController.ZIP);
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment().filename(export.fileName()).build().toString());
        bundleService.write(export, response.getOutputStream());
    }

    /** POST /api/auth/desktop/transfer/import?workspace= : crée dans l'espace le projet envoyé par l'app. */
    @PostMapping(value = "/import", consumes = {ProjectBundleController.ZIP, MediaType.APPLICATION_OCTET_STREAM_VALUE})
    public ResponseEntity<ApiResponse<ProjectResponse>> importProject(
        @RequestParam String workspace,
        @RequestHeader(SESSION_HEADER) String token,
        HttpServletRequest request
    ) throws IOException {
        Long userId = userOf(token);
        if (request.getContentLengthLong() > ProjectBundleController.MAX_UPLOAD_BYTES) {
            throw new BusinessException(ProjectBundleService.TOO_LARGE);
        }
        Path file = Files.createTempFile("taskforce-project-", ".zip");
        try {
            try (InputStream in = request.getInputStream(); OutputStream out = Files.newOutputStream(file)) {
                ProjectBundleService.copyAtMost(in, out, ProjectBundleController.MAX_UPLOAD_BYTES);
            }
            Long projectId = bundleService.importBundle(workspace, userId, file);
            return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Project imported", projectService.getProject(workspace, projectId, userId)));
        } finally {
            Files.deleteIfExists(file);
        }
    }

    private Long userOf(String token) {
        return sessions.userOf(token).orElseThrow(SessionEndedException::new);
    }

    /** La session de l'app n'est plus valable : 401, l'app demande de se reconnecter. */
    static final class SessionEndedException extends RuntimeException {
        SessionEndedException() {
            super("The session ended: sign in again");
        }
    }

    @ExceptionHandler(SessionEndedException.class)
    ResponseEntity<ApiResponse<Void>> sessionEnded(SessionEndedException e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error(e.getMessage()));
    }
}
