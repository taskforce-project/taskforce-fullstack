package com.taskforce.tf_api.core.api;

import java.nio.charset.StandardCharsets;
import java.util.List;

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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.ImportProcessRequest;
import com.taskforce.tf_api.core.dto.request.PublishProcessRequest;
import com.taskforce.tf_api.core.dto.response.ProcessResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.process.ProcessService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Les processus (ADR-027) : les workflows par défaut, et les processus d'un projet, leurs versions, leur vérification,
 * l'import et l'export en BPMN 2.0, la publication d'une version. Le service vérifie l'espace, le projet puis le rôle.
 *
 * <p>Un export est un téléchargement ({@code Content-Disposition: attachment}, le XML tel quel) : exception assumée à
 * l'enveloppe {@code ApiResponse}, comme l'export d'un projet. Une publication refusée par le vérificateur est une
 * réponse, pas une panne : 422, avec les refus en phrases.</p>
 */
@RestController
@RequestMapping("/api/workspaces/{slug}")
@RequiredArgsConstructor
public class ProcessController {

    private static final MediaType BPMN = new MediaType("application", "xml", StandardCharsets.UTF_8);

    private final ProcessService processes;
    private final UserRepository userRepository;
    private final JwtIdentityResolver identityResolver;

    // ------------------------------------------------------------------------------------------------- par défaut

    /** Les workflows par défaut, publiés avec le code, chacun avec son modèle et son empreinte. */
    @GetMapping("/processes/defaults")
    public ResponseEntity<ApiResponse<List<ProcessResponse.Default>>> listDefaultProcesses(
        @PathVariable String slug, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(processes.defaults(slug, resolveUserId(jwt))));
    }

    /** Un workflow par défaut en BPMN 2.0, pour l'ouvrir dans un autre outil. */
    @GetMapping("/processes/defaults/{key}/bpmn")
    public ResponseEntity<String> exportDefaultProcess(
        @PathVariable String slug, @PathVariable String key, @AuthenticationPrincipal Jwt jwt) {
        return file(processes.exportDefault(slug, key, resolveUserId(jwt)));
    }

    // ------------------------------------------------------------------------------------------------- un projet

    @GetMapping("/projects/{projectId}/processes")
    public ResponseEntity<ApiResponse<ProcessResponse.Overview>> listProcesses(
        @PathVariable String slug, @PathVariable Long projectId, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(processes.overview(slug, projectId, resolveUserId(jwt))));
    }

    /**
     * Publie une version du processus : la première pour une clé nouvelle, la suivante sinon. Un processus que le
     * vérificateur refuse n'entre pas : 422, avec ses refus. La référence d'API dit les deux réponses.
     */
    @PostMapping("/projects/{projectId}/processes")
    @io.swagger.v3.oas.annotations.responses.ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", useReturnTypeSchema = true,
            description = "The version is published: data.version holds it, with its number and its fingerprint."),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "422", useReturnTypeSchema = true,
            description = "The validator refused the process, or nothing changed since the current version: "
                + "data.refused holds the refusals, each a sentence with its code.")})
    public ResponseEntity<ApiResponse<ProcessResponse.Publication>> publishProcess(
        @PathVariable String slug, @PathVariable Long projectId, @Valid @RequestBody PublishProcessRequest body,
        @AuthenticationPrincipal Jwt jwt) {
        ProcessResponse.Publication publication = processes.publish(slug, projectId, body.model(), resolveUserId(jwt));
        if (publication.version() == null) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(ApiResponse.error("This process can't be published as it is.", publication));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Process published", publication));
    }

    /** Le vérificateur sur un processus, sans rien écrire. */
    @PostMapping("/projects/{projectId}/processes/check")
    public ResponseEntity<ApiResponse<ProcessResponse.Check>> checkProcess(
        @PathVariable String slug, @PathVariable Long projectId, @Valid @RequestBody PublishProcessRequest body,
        @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(processes.check(slug, projectId, body.model(), resolveUserId(jwt))));
    }

    /** Lit un fichier BPMN 2.0 dans le modèle et le vérifie, sans rien publier. */
    @PostMapping("/projects/{projectId}/processes/import")
    public ResponseEntity<ApiResponse<ProcessResponse.Import>> importProcess(
        @PathVariable String slug, @PathVariable Long projectId, @Valid @RequestBody ImportProcessRequest body,
        @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(processes.importBpmn(slug, projectId, body.xml(),
            resolveUserId(jwt))));
    }

    @GetMapping("/projects/{projectId}/processes/{key}")
    public ResponseEntity<ApiResponse<ProcessResponse.Detail>> getProcess(
        @PathVariable String slug, @PathVariable Long projectId, @PathVariable String key,
        @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(processes.detail(slug, projectId, key, resolveUserId(jwt))));
    }

    @GetMapping("/projects/{projectId}/processes/{key}/versions/{version}")
    public ResponseEntity<ApiResponse<ProcessResponse.Version>> getProcessVersion(
        @PathVariable String slug, @PathVariable Long projectId, @PathVariable String key,
        @PathVariable int version, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(processes.version(slug, projectId, key, version,
            resolveUserId(jwt))));
    }

    /** Une version en BPMN 2.0, son extension {@code tf:} comprise, pour l'ouvrir dans un modeleur. */
    @GetMapping("/projects/{projectId}/processes/{key}/versions/{version}/bpmn")
    public ResponseEntity<String> exportProcessVersion(
        @PathVariable String slug, @PathVariable Long projectId, @PathVariable String key,
        @PathVariable int version, @AuthenticationPrincipal Jwt jwt) {
        return file(processes.export(slug, projectId, key, version, resolveUserId(jwt)));
    }

    private static ResponseEntity<String> file(ProcessService.BpmnFile file) {
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.fileName())
                .build().toString())
            .contentType(BPMN)
            .body(file.xml());
    }

    private Long resolveUserId(Jwt jwt) {
        String email = identityResolver.resolveEmail(jwt);
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        return user.getId();
    }
}
