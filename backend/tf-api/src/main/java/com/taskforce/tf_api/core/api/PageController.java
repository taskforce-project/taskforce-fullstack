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
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.CreatePageRequest;
import com.taskforce.tf_api.core.dto.request.UpdatePageRequest;
import com.taskforce.tf_api.core.dto.response.PageResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.PageService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.security.JwtIdentityResolver;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Pages de projet.
 *
 * <p>Le {@code slug} et l'appelant sont transmis à {@link PageService} sur <b>chaque</b> opération :
 * ils portent le contrôle d'accès (cf. {@code PC-021}). Auparavant seul le {@code projectId} était
 * passé, et le {@code slug} — pourtant reçu — n'était jamais utilisé.
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/projects/{projectId}/pages")
@RequiredArgsConstructor
public class PageController {

    private final PageService         pageService;
    private final UserRepository      userRepository;
    private final JwtIdentityResolver identityResolver;

    @GetMapping
    public ResponseEntity<ApiResponse<List<PageResponse>>> listPages(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        List<PageResponse> pages = pageService.listPages(slug, projectId, resolveUserId(jwt));
        return ResponseEntity.ok(ApiResponse.success("Pages récupérées", pages));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<PageResponse>> createPage(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @Valid @RequestBody CreatePageRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        PageResponse page = pageService.createPage(slug, projectId, resolveUserId(jwt), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Page créée", page));
    }

    @GetMapping("/{pageId}")
    public ResponseEntity<ApiResponse<PageResponse>> getPage(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long pageId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        PageResponse page = pageService.getPage(slug, projectId, pageId, resolveUserId(jwt));
        return ResponseEntity.ok(ApiResponse.success("Page récupérée", page));
    }

    @PatchMapping("/{pageId}")
    public ResponseEntity<ApiResponse<PageResponse>> updatePage(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long pageId,
        @Valid @RequestBody UpdatePageRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        PageResponse page = pageService.updatePage(slug, projectId, pageId, resolveUserId(jwt), request);
        return ResponseEntity.ok(ApiResponse.success("Page mise à jour", page));
    }

    @DeleteMapping("/{pageId}")
    public ResponseEntity<ApiResponse<Void>> deletePage(
        @PathVariable String slug,
        @PathVariable Long projectId,
        @PathVariable Long pageId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        pageService.deletePage(slug, projectId, pageId, resolveUserId(jwt));
        return ResponseEntity.ok(ApiResponse.success("Page supprimée", null));
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /** Passe par {@link JwtIdentityResolver} : en profil dev, un token sans claim {@code email} tombait
     *  sinon en « Utilisateur introuvable » (incohérence {@code TF-JWT-IDENTITY}). */
    private Long resolveUserId(Jwt jwt) {
        String email = identityResolver.resolveEmail(jwt);
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }
}
