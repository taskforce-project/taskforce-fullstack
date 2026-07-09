package com.taskforce.tf_api.core.api;

import java.net.URI;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.ConnectPlaneRequest;
import com.taskforce.tf_api.core.dto.request.GitHubLinkRequest;
import com.taskforce.tf_api.core.dto.request.SlackChannelRequest;
import com.taskforce.tf_api.core.dto.response.ConnectUrlResponse;
import com.taskforce.tf_api.core.dto.response.GitHubIssueResponse;
import com.taskforce.tf_api.core.dto.response.GitHubLinkResponse;
import com.taskforce.tf_api.core.dto.response.GitHubRepoResponse;
import com.taskforce.tf_api.core.dto.response.IntegrationCatalogResponse;
import com.taskforce.tf_api.core.dto.response.IntegrationStatusResponse;
import com.taskforce.tf_api.core.dto.response.PlaneStatusResponse;
import com.taskforce.tf_api.core.dto.response.PlaneSyncResponse;
import com.taskforce.tf_api.core.dto.response.SlackChannelResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.GitHubIntegrationService;
import com.taskforce.tf_api.core.service.PlaneClient.PlaneProject;
import com.taskforce.tf_api.core.service.PlaneIntegrationService;
import com.taskforce.tf_api.core.service.SlackIntegrationService;
import com.taskforce.tf_api.core.service.integration.IntegrationCatalogService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
public class IntegrationController {

    private final GitHubIntegrationService gitHubService;
    private final SlackIntegrationService  slackService;
    private final PlaneIntegrationService  planeService;
    private final IntegrationCatalogService catalogService;
    private final UserRepository           userRepository;

    // ====================================================================
    // Catalogue d'intégrations (le « pool » d'outils, générique)
    // ====================================================================

    @GetMapping("/api/workspaces/{slug}/integrations/catalog")
    public ResponseEntity<ApiResponse<IntegrationCatalogResponse>> catalog(
        @PathVariable String slug, @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(ApiResponse.success(catalogService.getCatalog(slug, resolveUser(jwt).getId())));
    }

    // ====================================================================
    // GitHub — status & OAuth
    // ====================================================================

    @GetMapping("/api/workspaces/{slug}/integrations/github/status")
    public ResponseEntity<ApiResponse<IntegrationStatusResponse>> githubStatus(
        @PathVariable String slug
    ) {
        return ResponseEntity.ok(ApiResponse.success(gitHubService.getStatus(slug)));
    }

    @GetMapping("/api/workspaces/{slug}/integrations/github/repos")
    public ResponseEntity<ApiResponse<List<GitHubRepoResponse>>> githubRepos(@PathVariable String slug) {
        return ResponseEntity.ok(ApiResponse.success(gitHubService.listRepositories(slug)));
    }

    @GetMapping("/api/workspaces/{slug}/integrations/github/issues")
    public ResponseEntity<ApiResponse<List<GitHubIssueResponse>>> githubRepoIssues(
        @PathVariable String slug,
        @RequestParam String repo
    ) {
        return ResponseEntity.ok(ApiResponse.success(gitHubService.listRepoIssues(slug, repo)));
    }

    /**
     * Démarre le flux OAuth : renvoie l'URL d'autorisation GitHub (JSON).
     * Appelé en XHR authentifié — le front navigue ensuite vers {@code authorizeUrl}.
     * (Un 302 ne marcherait pas : {@code window.location.href} n'envoie pas le Bearer du localStorage.)
     */
    @GetMapping("/api/workspaces/{slug}/integrations/github/connect")
    public ResponseEntity<ApiResponse<ConnectUrlResponse>> githubConnect(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        User user = resolveUser(jwt);
        URI authorizeUrl = gitHubService.buildAuthorizeUrl(slug, user);
        return ResponseEntity.ok(ApiResponse.success(new ConnectUrlResponse(authorizeUrl.toString())));
    }

    /** Callback appelé par GitHub — endpoint PUBLIC (pas de JWT requis). {@code state} = token aléatoire. */
    @GetMapping("/api/integrations/github/callback")
    public ResponseEntity<Void> githubCallback(
        @RequestParam String code,
        @RequestParam String state
    ) {
        String redirectUrl = gitHubService.handleCallback(code, state);
        return ResponseEntity.status(HttpStatus.FOUND)
            .location(URI.create(redirectUrl))
            .build();
    }

    @DeleteMapping("/api/workspaces/{slug}/integrations/github")
    public ResponseEntity<ApiResponse<Void>> githubDisconnect(@PathVariable String slug) {
        gitHubService.disconnect(slug);
        return ResponseEntity.ok(ApiResponse.success("GitHub déconnecté", null));
    }

    // ====================================================================
    // GitHub — issue links
    // ====================================================================

    @PostMapping("/api/workspaces/{slug}/integrations/github/issues/{issueId}/links")
    public ResponseEntity<ApiResponse<GitHubLinkResponse>> addGitHubLink(
        @PathVariable String slug,
        @PathVariable Long issueId,
        @Valid @RequestBody GitHubLinkRequest req,
        @AuthenticationPrincipal Jwt jwt
    ) {
        User user = resolveUser(jwt);
        GitHubLinkResponse link = gitHubService.addLink(issueId, req, user);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Lien GitHub ajouté", link));
    }

    @GetMapping("/api/workspaces/{slug}/integrations/github/issues/{issueId}/links")
    public ResponseEntity<ApiResponse<List<GitHubLinkResponse>>> getGitHubLinks(
        @PathVariable String slug,
        @PathVariable Long issueId
    ) {
        return ResponseEntity.ok(ApiResponse.success(gitHubService.getLinks(issueId)));
    }

    @DeleteMapping("/api/workspaces/{slug}/integrations/github/links/{linkId}")
    public ResponseEntity<ApiResponse<Void>> deleteGitHubLink(
        @PathVariable String slug,
        @PathVariable Long linkId
    ) {
        gitHubService.deleteLink(linkId);
        return ResponseEntity.ok(ApiResponse.success("Lien GitHub supprimé", null));
    }

    // ====================================================================
    // Slack — status & OAuth
    // ====================================================================

    @GetMapping("/api/workspaces/{slug}/integrations/slack/status")
    public ResponseEntity<ApiResponse<IntegrationStatusResponse>> slackStatus(
        @PathVariable String slug
    ) {
        return ResponseEntity.ok(ApiResponse.success(slackService.getStatus(slug)));
    }

    @GetMapping("/api/workspaces/{slug}/integrations/slack/connect")
    public ResponseEntity<ApiResponse<ConnectUrlResponse>> slackConnect(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        User user = resolveUser(jwt);
        URI authorizeUrl = slackService.buildAuthorizeUrl(slug, user);
        return ResponseEntity.ok(ApiResponse.success(new ConnectUrlResponse(authorizeUrl.toString())));
    }

    /** Callback appelé par Slack — endpoint PUBLIC. {@code state} = token aléatoire. */
    @GetMapping("/api/integrations/slack/callback")
    public ResponseEntity<Void> slackCallback(
        @RequestParam String code,
        @RequestParam String state
    ) {
        String redirectUrl = slackService.handleCallback(code, state);
        return ResponseEntity.status(HttpStatus.FOUND)
            .location(URI.create(redirectUrl))
            .build();
    }

    @DeleteMapping("/api/workspaces/{slug}/integrations/slack")
    public ResponseEntity<ApiResponse<Void>> slackDisconnect(@PathVariable String slug) {
        slackService.disconnect(slug);
        return ResponseEntity.ok(ApiResponse.success("Slack déconnecté", null));
    }

    // ====================================================================
    // Slack — channel config
    // ====================================================================

    @PostMapping("/api/workspaces/{slug}/integrations/slack/channels")
    public ResponseEntity<ApiResponse<SlackChannelResponse>> addSlackChannel(
        @PathVariable String slug,
        @Valid @RequestBody SlackChannelRequest req
    ) {
        SlackChannelResponse channel = slackService.addChannel(slug, req);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Canal Slack ajouté", channel));
    }

    @GetMapping("/api/workspaces/{slug}/integrations/slack/channels")
    public ResponseEntity<ApiResponse<List<SlackChannelResponse>>> getSlackChannels(
        @PathVariable String slug
    ) {
        return ResponseEntity.ok(ApiResponse.success(slackService.getChannels(slug)));
    }

    @DeleteMapping("/api/workspaces/{slug}/integrations/slack/channels/{channelId}")
    public ResponseEntity<ApiResponse<Void>> deleteSlackChannel(
        @PathVariable String slug,
        @PathVariable Long channelId
    ) {
        slackService.deleteChannel(slug, channelId);
        return ResponseEntity.ok(ApiResponse.success("Canal Slack supprimé", null));
    }

    // ====================================================================
    // Plane — connexion (clé API) + ingestion Brain OS
    // ====================================================================

    @GetMapping("/api/workspaces/{slug}/integrations/plane/status")
    public ResponseEntity<ApiResponse<PlaneStatusResponse>> planeStatus(
        @PathVariable String slug, @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(ApiResponse.success(planeService.getStatus(slug, resolveUser(jwt).getId())));
    }

    @PostMapping("/api/workspaces/{slug}/integrations/plane/connect")
    public ResponseEntity<ApiResponse<PlaneStatusResponse>> planeConnect(
        @PathVariable String slug,
        @Valid @RequestBody ConnectPlaneRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        PlaneStatusResponse status = planeService.connect(slug, resolveUser(jwt).getId(), request);
        return ResponseEntity.ok(ApiResponse.success("Plane connecté", status));
    }

    @GetMapping("/api/workspaces/{slug}/integrations/plane/projects")
    public ResponseEntity<ApiResponse<List<PlaneProject>>> planeProjects(
        @PathVariable String slug, @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(ApiResponse.success(planeService.listProjects(slug, resolveUser(jwt).getId())));
    }

    @PostMapping("/api/workspaces/{slug}/integrations/plane/sync")
    public ResponseEntity<ApiResponse<PlaneSyncResponse>> planeSync(
        @PathVariable String slug,
        @RequestParam("project") String projectId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        PlaneSyncResponse result = planeService.sync(slug, resolveUser(jwt).getId(), projectId);
        return ResponseEntity.ok(ApiResponse.success("Synchronisation Plane terminée", result));
    }

    @DeleteMapping("/api/workspaces/{slug}/integrations/plane")
    public ResponseEntity<ApiResponse<Void>> planeDisconnect(
        @PathVariable String slug, @AuthenticationPrincipal Jwt jwt
    ) {
        planeService.disconnect(slug, resolveUser(jwt).getId());
        return ResponseEntity.ok(ApiResponse.success("Plane déconnecté", null));
    }

    // ====================================================================
    // Helpers
    // ====================================================================

    private User resolveUser(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        return userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }
}
