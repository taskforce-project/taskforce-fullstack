package com.taskforce.tf_api.core.api;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.enums.PlanFeature;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.PlanFeatureService;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.mcp.McpOAuthService;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;

/**
 * Exécution d'une action d'outil <b>MCP externe</b> après <b>validation humaine</b> : l'agent Cortex
 * <i>propose</i> une écriture externe (statut {@code pending} dans les {@code toolCalls}), l'utilisateur
 * la <i>valide</i> depuis l'UI, qui appelle cet endpoint pour l'exécuter réellement.
 *
 * <p>Autorisation : membre du workspace + plan propriétaire couvrant {@link PlanFeature#INTEGRATIONS}
 * (BUSINESS+). L'outil est ré-résolu côté serveur depuis les connecteurs du workspace — le client ne
 * fait qu'échoer la référence proposée + ses arguments.
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/mcp")
@RequiredArgsConstructor
public class McpActionController {

    private final WorkspaceMcpService  workspaceMcp;
    private final UserRepository       userRepository;
    private final BrainAccessGuard     access;
    private final WorkspaceRepository  workspaceRepository;
    private final PlanFeatureService   planFeatureService;
    private final AuthorizationService authorizationService;
    private final McpOAuthService      mcpOAuthService;

    /** Exécute une action externe validée (bouton d'approbation). */
    @PostMapping("/actions/execute")
    public ResponseEntity<ApiResponse<McpActionResult>> execute(
        @PathVariable String slug,
        @Valid @RequestBody McpActionRequest body,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeIntegrations(slug, jwt);
        String output = workspaceMcp.execute(ws.getId(), body.toolRef(), body.arguments());
        return ResponseEntity.ok(ApiResponse.success(new McpActionResult(body.toolRef(), output)));
    }

    /** Statut des serveurs MCP connectés (joignabilité + outils exposés) — pour l'UI de gestion. */
    @GetMapping("/servers")
    public ResponseEntity<ApiResponse<List<WorkspaceMcpService.McpServerStatus>>> servers(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeIntegrations(slug, jwt);
        return ResponseEntity.ok(ApiResponse.success(workspaceMcp.serverStatuses(ws.getId())));
    }

    /** Connecte (ou reconfigure) un serveur MCP externe sur le workspace ; renvoie le statut frais. */
    @PostMapping("/servers")
    public ResponseEntity<ApiResponse<List<WorkspaceMcpService.McpServerStatus>>> connect(
        @PathVariable String slug,
        @Valid @RequestBody McpServerRequest body,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeManager(slug, jwt);
        workspaceMcp.connectServer(ws, body.connectorKey(), body.mcpUrl(), body.mcpToken(), body.mcpAllow());
        return ResponseEntity.ok(ApiResponse.success(workspaceMcp.serverStatuses(ws.getId())));
    }

    /** Déconnecte un serveur MCP externe ; renvoie le statut frais. */
    @DeleteMapping("/servers/{connectorKey}")
    public ResponseEntity<ApiResponse<List<WorkspaceMcpService.McpServerStatus>>> disconnect(
        @PathVariable String slug,
        @PathVariable String connectorKey,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeManager(slug, jwt);
        workspaceMcp.disconnectServer(ws.getId(), connectorKey);
        return ResponseEntity.ok(ApiResponse.success(workspaceMcp.serverStatuses(ws.getId())));
    }

    /** Démarre l'OAuth 1-clic d'un serveur MCP : renvoie l'URL d'autorisation (le front y redirige). */
    @PostMapping("/servers/{connectorKey}/oauth/start")
    public ResponseEntity<ApiResponse<Map<String, String>>> oauthStart(
        @PathVariable String slug,
        @PathVariable String connectorKey,
        @Valid @RequestBody McpOAuthStartRequest body,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeManager(slug, jwt);
        String url = mcpOAuthService.start(ws, resolveUserId(jwt), connectorKey, body.mcpUrl());
        return ResponseEntity.ok(ApiResponse.success(Map.of("authorizeUrl", url)));
    }

    /** Membre du workspace + plan propriétaire couvrant les intégrations (BUSINESS+), sinon 409. */
    private Workspace authorizeIntegrations(String slug, Jwt jwt) {
        Workspace ws = access.resolveAndAuthorize(slug, resolveUserId(jwt));
        PlanType plan = workspaceRepository.findOwnerPlanBySlug(slug).orElse(PlanType.FREE);
        planFeatureService.requireFeature(plan, PlanFeature.INTEGRATIONS);
        return ws;
    }

    /** Config serveur MCP = action de gestion : membre + INTEGRATIONS + rôle OWNER/ADMIN (sinon 403). */
    private Workspace authorizeManager(String slug, Jwt jwt) {
        Workspace ws = authorizeIntegrations(slug, jwt);
        authorizationService.requireManager(ws.getId(), resolveUserId(jwt));
        return ws;
    }

    private Long resolveUserId(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        return user.getId();
    }

    /** Référence namespacée {@code <connecteur>__<outil>} + arguments (échoés depuis l'action proposée). */
    public record McpActionRequest(@NotBlank String toolRef, Map<String, Object> arguments) {}

    /** Résultat texte de l'outil externe. */
    public record McpActionResult(String toolRef, String output) {}

    /** Démarrage OAuth 1-clic : l'URL du serveur MCP dont on découvre le flux OAuth. */
    public record McpOAuthStartRequest(@NotBlank String mcpUrl) {}

    /** Connexion d'un serveur MCP : clé de connecteur + endpoint {@code mcpUrl} (+ token/allow-list optionnels). */
    public record McpServerRequest(
        @NotBlank String connectorKey,
        @NotBlank String mcpUrl,
        String mcpToken,
        String mcpAllow
    ) {}
}
