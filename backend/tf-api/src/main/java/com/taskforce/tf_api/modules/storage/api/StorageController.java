package com.taskforce.tf_api.modules.storage.api;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.modules.storage.domain.StoredDocument;
import com.taskforce.tf_api.core.service.mcp.MicrosoftGraphApi;
import com.taskforce.tf_api.modules.storage.service.GooglePickerService;
import com.taskforce.tf_api.modules.storage.service.MicrosoftFoldersService;
import com.taskforce.tf_api.modules.storage.service.StorageTargetService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/**
 * Où TaskForce range ce qu'il écrit (séance n°22, R156) : l'écran « Storage » de l'espace et celui d'un projet, le choix
 * de la cible, et le lien d'un document rangé. Le service vérifie l'espace, le projet et les droits.
 */
@RestController
@RequestMapping("/api/workspaces/{slug}")
@RequiredArgsConstructor
@Validated
public class StorageController {

    private final StorageTargetService storage;
    private final GooglePickerService picker;
    private final MicrosoftFoldersService microsoftFolders;
    private final UserRepository userRepository;
    private final JwtIdentityResolver identityResolver;

    /** Ce que la personne choisit : la cible, et son dossier chez l'éditeur ou sur la machine. */
    public record StorageTargetRequest(
        @NotBlank @Pattern(regexp = "server|machine|google-drive|onedrive") String storage,
        @Size(max = 512) String folderId,
        @Size(max = 255) String driveId,
        @Size(max = 1024) String path) {

        StorageTargetService.TargetRequest toTarget() {
            return new StorageTargetService.TargetRequest(storage, folderId, driveId, path);
        }
    }

    @GetMapping("/storage")
    public ResponseEntity<ApiResponse<StorageTargetService.Overview>> workspaceStorage(
        @PathVariable String slug, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(storage.overview(slug, userId(jwt), null)));
    }

    @PutMapping("/storage")
    public ResponseEntity<ApiResponse<StorageTargetService.Overview>> chooseWorkspaceStorage(
        @PathVariable String slug, @Valid @RequestBody StorageTargetRequest body, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(storage.choose(slug, userId(jwt), null, body.toTarget())));
    }

    /** Revient au serveur de TaskForce. */
    @DeleteMapping("/storage")
    public ResponseEntity<ApiResponse<StorageTargetService.Overview>> resetWorkspaceStorage(
        @PathVariable String slug, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(storage.reset(slug, userId(jwt), null)));
    }

    @GetMapping("/projects/{projectId}/storage")
    public ResponseEntity<ApiResponse<StorageTargetService.Overview>> projectStorage(
        @PathVariable String slug, @PathVariable Long projectId, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(storage.overview(slug, userId(jwt), projectId)));
    }

    @PutMapping("/projects/{projectId}/storage")
    public ResponseEntity<ApiResponse<StorageTargetService.Overview>> chooseProjectStorage(
        @PathVariable String slug, @PathVariable Long projectId, @Valid @RequestBody StorageTargetRequest body,
        @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(storage.choose(slug, userId(jwt), projectId, body.toTarget())));
    }

    /** Le projet reprend le choix de l'espace. */
    @DeleteMapping("/projects/{projectId}/storage")
    public ResponseEntity<ApiResponse<StorageTargetService.Overview>> resetProjectStorage(
        @PathVariable String slug, @PathVariable Long projectId, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(ApiResponse.success(storage.reset(slug, userId(jwt), projectId)));
    }

    /** Le lien qui ouvre un document rangé : chez l'éditeur, ou un lien temporaire du serveur de TaskForce. */
    @GetMapping("/storage/documents/{documentId}/link")
    public ResponseEntity<ApiResponse<Map<String, String>>> documentLink(
        @PathVariable String slug, @PathVariable Long documentId, @AuthenticationPrincipal Jwt jwt) {
        StoredDocument doc = storage.document(slug, userId(jwt), documentId);
        Map<String, String> out = new LinkedHashMap<>();
        out.put("url", storage.writer(doc.getKind()).link(doc));
        return ResponseEntity.ok(ApiResponse.success(out));
    }

    /**
     * Ce qu'il faut au sélecteur de Google Drive : la clé du navigateur, le projet Google, et le jeton court de la
     * connexion de la personne elle-même. Jamais gardé en cache.
     */
    @GetMapping("/storage/google/picker")
    public ResponseEntity<ApiResponse<GooglePickerService.PickerConfig>> googlePicker(
        @PathVariable String slug, @AuthenticationPrincipal Jwt jwt) {
        Long user = userId(jwt);
        GooglePickerService.PickerConfig config = picker.config(storage.workspaceId(slug, user), user);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(config));
    }

    /**
     * Les dossiers de OneDrive et de SharePoint où ranger, par la connexion « Microsoft 365 » de la personne : sans
     * endroit, son OneDrive et les bibliothèques des sites qu'elle suit ; sinon les dossiers de cet endroit.
     */
    @GetMapping("/storage/microsoft/folders")
    public ResponseEntity<ApiResponse<List<MicrosoftGraphApi.Place>>> microsoftFolders(
        @PathVariable String slug,
        @RequestParam(required = false) @Size(max = 400) String driveId,
        @RequestParam(required = false) @Size(max = 400) String itemId,
        @AuthenticationPrincipal Jwt jwt) {
        Long user = userId(jwt);
        return ResponseEntity.ok(ApiResponse.success(
            microsoftFolders.folders(storage.workspaceId(slug, user), user, driveId, itemId)));
    }

    private Long userId(Jwt jwt) {
        String email = identityResolver.resolveEmail(jwt);
        User user = userRepository.findByEmail(email).orElseThrow(() -> new ResourceNotFoundException("User not found"));
        return user.getId();
    }
}
