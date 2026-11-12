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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.core.service.mcp.ConnectorAppService;
import com.taskforce.tf_api.core.service.mcp.McpActionService;
import com.taskforce.tf_api.core.service.mcp.McpImportService;
import com.taskforce.tf_api.core.service.mcp.McpOAuthService;
import com.taskforce.tf_api.core.service.mcp.WorkspaceMcpService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;

/**
 * Les connexions aux outils et leurs outils MCP (TF-MCP-02, TF-MCP-06 ; séance n°22, R154 et R158).
 *
 * <p>Une connexion appartient à la personne qui la fait ({@code shared=false}, le défaut) : elle seule la voit, s'en
 * sert, la déconnecte ; un membre suffit. Une connexion partagée avec l'espace ({@code shared=true}) se crée, se
 * déconnecte et se réaccorde par un propriétaire ou un administrateur ; ses outils servent à tous, et une écriture par
 * elle reste réservée aux propriétaires et administrateurs. Le contrôleur vérifie que la personne est membre de l'espace ;
 * les services des connexions vérifient le rôle (règle 3). Le geste « Connect » ({@code /connect}) choisit le chemin :
 * l'OAuth avec le premier client possible, la clé guidée, l'étape de l'administrateur. La console d'actions passe par
 * les règles de l'espace et entre au dossier ({@link McpActionService}).</p>
 */
@RestController
@RequestMapping("/api/workspaces/{slug}/mcp")
@RequiredArgsConstructor
public class McpActionController {

    private final WorkspaceMcpService  workspaceMcp;
    private final UserRepository       userRepository;
    private final BrainAccessGuard     access;
    private final AuthorizationService authorizationService;
    private final McpOAuthService      mcpOAuthService;
    private final McpImportService     mcpImportService;
    private final McpActionService     mcpActionService;
    private final ConnectorAppService  connectorApps;

    /**
     * Lance une action d'un outil connecté (la console, ou l'accord d'une carte de Cortex sans dossier) : jugée par les
     * règles de l'espace, gardée au dossier. Une action demandée ne tourne qu'avec {@code confirmed}.
     */
    @PostMapping("/actions/execute")
    public ResponseEntity<ApiResponse<McpActionService.ActionResult>> execute(
        @PathVariable String slug,
        @Valid @RequestBody McpActionRequest body,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeMember(slug, jwt);
        return ResponseEntity.ok(ApiResponse.success(mcpActionService.run(ws, resolveUserId(jwt), body.toolRef(),
            body.arguments(), Boolean.TRUE.equals(body.confirmed()))));
    }

    /** Les connexions que la personne voit (les siennes, celles de l'espace), avec leur état et leurs outils. */
    @GetMapping("/servers")
    public ResponseEntity<ApiResponse<List<WorkspaceMcpService.McpServerStatus>>> servers(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeMember(slug, jwt);
        return ResponseEntity.ok(ApiResponse.success(workspaceMcp.serverStatuses(ws.getId(), resolveUserId(jwt))));
    }

    /** Outils (schéma d'arguments inclus) de la connexion que la personne utilise : la console d'actions (TF-MCP-06). */
    @GetMapping("/servers/{connectorKey}/tools")
    public ResponseEntity<ApiResponse<List<WorkspaceMcpService.McpToolInfo>>> serverTools(
        @PathVariable String slug,
        @PathVariable String connectorKey,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeMember(slug, jwt);
        return ResponseEntity.ok(ApiResponse.success(
            workspaceMcp.serverTools(ws.getId(), resolveUserId(jwt), connectorKey)));
    }

    /**
     * Connecte (ou reconfigure) un serveur MCP par son adresse, avec ou sans clé ; renvoie les statuts frais. Clé d'un
     * préréglage du catalogue (son serveur officiel seulement), {@code custom} pour un nouveau serveur personnalisé (nom
     * obligatoire), ou la clé {@code custom-…} d'un serveur personnalisé existant. Un serveur local demande
     * {@code localApproved}.
     */
    @PostMapping("/servers")
    public ResponseEntity<ApiResponse<List<WorkspaceMcpService.McpServerStatus>>> connect(
        @PathVariable String slug,
        @Valid @RequestBody McpServerRequest body,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeMember(slug, jwt);
        User person = resolveUser(jwt);
        workspaceMcp.connectServer(ws, person, new WorkspaceMcpService.ServerRequest(body.connectorKey(), body.name(),
            body.mcpUrl(), body.mcpToken(), body.headerName(), body.mcpAllow(), Boolean.TRUE.equals(body.shared()),
            Boolean.TRUE.equals(body.localApproved())));
        return ResponseEntity.ok(ApiResponse.success(workspaceMcp.serverStatuses(ws.getId(), person.getId())));
    }

    /**
     * Le geste « Connect » d'un outil : TaskForce choisit le chemin et dit la suite ({@code browser} avec l'adresse à
     * ouvrir, {@code connected}, {@code admin}, {@code company-app}, {@code key}, {@code local}).
     */
    @PostMapping("/servers/{connectorKey}/connect")
    public ResponseEntity<ApiResponse<McpOAuthService.ConnectOutcome>> connectTool(
        @PathVariable String slug,
        @PathVariable String connectorKey,
        @Valid @RequestBody McpConnectRequest body,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeMember(slug, jwt);
        User person = resolveUser(jwt);
        return ResponseEntity.ok(ApiResponse.success(mcpOAuthService.connect(ws, person,
            new McpOAuthService.ConnectRequest(connectorKey, body.name(), body.mcpUrl(), body.mcpToken(),
                body.headerName(), Boolean.TRUE.equals(body.shared()), Boolean.TRUE.equals(body.allowWrites()),
                Boolean.TRUE.equals(body.localApproved()), body.returnTo()))));
    }

    /**
     * Déconnecte la connexion de la personne, ou celle de l'espace ({@code shared=true}) : le jeton est révoqué chez
     * l'éditeur quand il le permet (RFC 7009), et la réponse le dit.
     */
    @DeleteMapping("/servers/{connectorKey}")
    public ResponseEntity<ApiResponse<DisconnectResponse>> disconnect(
        @PathVariable String slug,
        @PathVariable String connectorKey,
        @RequestParam(defaultValue = "false") boolean shared,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeMember(slug, jwt);
        Long userId = resolveUserId(jwt);
        WorkspaceMcpService.DisconnectResult result = workspaceMcp.disconnectServer(ws.getId(), userId, connectorKey, shared);
        return ResponseEntity.ok(ApiResponse.success(new DisconnectResponse(result.revoked(), result.revocable(),
            workspaceMcp.serverStatuses(ws.getId(), userId))));
    }

    /** Redonne l'accord aux outils qui ont changé depuis la connexion (R158) ; renvoie les statuts frais. */
    @PostMapping("/servers/{connectorKey}/tools/approve")
    public ResponseEntity<ApiResponse<List<WorkspaceMcpService.McpServerStatus>>> approveTools(
        @PathVariable String slug,
        @PathVariable String connectorKey,
        @RequestParam(defaultValue = "false") boolean shared,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeMember(slug, jwt);
        Long userId = resolveUserId(jwt);
        workspaceMcp.approveTools(ws.getId(), userId, connectorKey, shared);
        return ResponseEntity.ok(ApiResponse.success(workspaceMcp.serverStatuses(ws.getId(), userId)));
    }

    /**
     * Démarre l'OAuth d'un serveur MCP par son adresse : renvoie l'URL d'autorisation (le front y envoie le navigateur).
     * La clé d'un préréglage ne mène qu'à son serveur officiel : une autre adresse est refusée.
     */
    @PostMapping("/servers/{connectorKey}/oauth/start")
    public ResponseEntity<ApiResponse<Map<String, String>>> oauthStart(
        @PathVariable String slug,
        @PathVariable String connectorKey,
        @Valid @RequestBody McpOAuthStartRequest body,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeMember(slug, jwt);
        String url = mcpOAuthService.start(ws, resolveUserId(jwt), new McpOAuthService.ConnectRequest(connectorKey,
            body.name(), body.mcpUrl(), null, null, Boolean.TRUE.equals(body.shared()),
            Boolean.TRUE.equals(body.allowWrites()), false, body.returnTo()), body.mcpUrl());
        return ResponseEntity.ok(ApiResponse.success(Map.of("authorizeUrl", url)));
    }

    /** Les applications d'entreprise de l'espace (chemin C) : jamais leur secret. Propriétaires et administrateurs. */
    @GetMapping("/apps")
    public ResponseEntity<ApiResponse<List<ConnectorAppService.CompanyApp>>> apps(
        @PathVariable String slug,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeMember(slug, jwt);
        return ResponseEntity.ok(ApiResponse.success(connectorApps.list(ws.getId(), resolveUserId(jwt))));
    }

    /** Enregistre l'application de l'entreprise chez un éditeur : son identifiant et son secret, chiffré au repos. */
    @PutMapping("/apps/{connectorKey}")
    public ResponseEntity<ApiResponse<ConnectorAppService.CompanyApp>> saveApp(
        @PathVariable String slug,
        @PathVariable String connectorKey,
        @Valid @RequestBody CompanyAppRequest body,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeMember(slug, jwt);
        return ResponseEntity.ok(ApiResponse.success(
            connectorApps.save(ws, resolveUser(jwt), connectorKey, body.clientId(), body.clientSecret())));
    }

    @DeleteMapping("/apps/{connectorKey}")
    public ResponseEntity<ApiResponse<Void>> removeApp(
        @PathVariable String slug,
        @PathVariable String connectorKey,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeMember(slug, jwt);
        connectorApps.remove(ws.getId(), resolveUserId(jwt), connectorKey);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /**
     * Importe un projet externe (issues d'un connecteur MCP) dans un nouveau projet natif TaskForce, par la connexion
     * de la personne, jugé par les règles et gardé au dossier.
     */
    @PostMapping("/import")
    public ResponseEntity<ApiResponse<McpImportService.ImportResult>> importProject(
        @PathVariable String slug,
        @Valid @RequestBody McpImportRequest body,
        @AuthenticationPrincipal Jwt jwt
    ) {
        Workspace ws = authorizeManager(slug, jwt);
        McpImportService.ImportResult result =
            mcpImportService.importProject(ws, resolveUserId(jwt), body.connectorKey(), body.targetName());
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /** Membre du workspace (sinon 403). Plus de garde de plan : chaque instance a toutes les fonctionnalités (ADR-016). */
    private Workspace authorizeMember(String slug, Jwt jwt) {
        return access.resolveAndAuthorize(slug, resolveUserId(jwt));
    }

    /** Ce qui touche l'espace entier = action de gestion : membre + rôle OWNER/ADMIN (sinon 403). */
    private Workspace authorizeManager(String slug, Jwt jwt) {
        Workspace ws = authorizeMember(slug, jwt);
        authorizationService.requireManager(ws.getId(), resolveUserId(jwt));
        return ws;
    }

    private Long resolveUserId(Jwt jwt) {
        return resolveUser(jwt).getId();
    }

    private User resolveUser(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        return userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }

    /**
     * Référence namespacée {@code <connecteur>__<outil>} + arguments ; {@code confirmed} : la personne a confirmé une
     * action que les règles demandent.
     */
    public record McpActionRequest(@NotBlank String toolRef, Map<String, Object> arguments, Boolean confirmed) {}

    /** Ce que la déconnexion a fait chez l'éditeur, et les statuts frais. */
    public record DisconnectResponse(boolean revoked, boolean revocable,
                                     List<WorkspaceMcpService.McpServerStatus> servers) {}

    /**
     * Démarrage OAuth : URL du serveur MCP, nom d'un serveur personnalisé, chemin de retour applicatif optionnel
     * (retour fluide), partage avec l'espace, écriture accordée.
     */
    public record McpOAuthStartRequest(@NotBlank String mcpUrl, @Size(max = 60) String name, String returnTo,
                                       Boolean shared, Boolean allowWrites) {}

    /**
     * Le geste « Connect » : pour un préréglage, rien d'obligatoire ; l'adresse d'un serveur ajouté à la main ou créé
     * par l'entreprise ; la clé guidée ; le partage, l'écriture accordée, l'accord d'un serveur local.
     */
    public record McpConnectRequest(
        @Size(max = 60) String name,
        @Size(max = 2000) String mcpUrl,
        @Size(max = 8000) String mcpToken,
        @Size(max = 64) String headerName,
        Boolean shared,
        Boolean allowWrites,
        Boolean localApproved,
        @Size(max = 500) String returnTo
    ) {}

    /** Import d'un projet externe : connecteur MCP source + nom du projet natif à créer. */
    public record McpImportRequest(@NotBlank String connectorKey, @NotBlank String targetName) {}

    /** L'application de l'entreprise : son identifiant, et son secret (vide : celui déjà saisi reste). */
    public record CompanyAppRequest(@NotBlank @Size(max = 512) String clientId, @Size(max = 4096) String clientSecret) {}

    /**
     * Connexion d'un serveur MCP : clé, nom (serveur personnalisé), endpoint {@code mcpUrl}, jeton optionnel
     * relayé en {@code Authorization: Bearer} ou dans l'en-tête {@code headerName}, allow-list optionnelle, partage,
     * accord d'un serveur local.
     */
    public record McpServerRequest(
        @NotBlank String connectorKey,
        @Size(max = 60) String name,
        @NotBlank @Size(max = 2000) String mcpUrl,
        @Size(max = 8000) String mcpToken,
        @Size(max = 64) String headerName,
        String mcpAllow,
        Boolean shared,
        Boolean localApproved
    ) {}
}
