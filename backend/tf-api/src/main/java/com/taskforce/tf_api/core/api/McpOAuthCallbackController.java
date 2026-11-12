package com.taskforce.tf_api.core.api;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.service.mcp.McpOAuthService;
import com.taskforce.tf_api.core.service.mcp.McpOAuthSettings;

import lombok.RequiredArgsConstructor;

/**
 * Le retour OAuth des serveurs MCP (TF-MCP-02) et nos documents de métadonnées client (CIMD, norme MCP du
 * 28/07/2026). Endpoints <b>publics</b> : le serveur d'autorisation y redirige le navigateur après consentement, ou y lit
 * qui est TaskForce. Le retour résout tout depuis le {@code state} (stocké côté serveur, anti-CSRF), jamais depuis un
 * paramètre devinable, et répond <b>toujours</b> par une redirection vers l'UI (succès ou erreur).
 *
 * <p>Les deux documents CIMD sont servis par chaque instance en HTTPS ; leur adresse est l'identifiant du client.
 * {@code client.json} : le serveur, qui reçoit le retour sur sa propre adresse. {@code desktop-client.json} : l'app
 * desktop, publié par le serveur hébergé, dont le retour se fait sur 127.0.0.1, sur l'un des quatre ports fixes de la
 * coque. Une installation auto-hébergée sert les siens, à l'adresse de son API.</p>
 */
@RestController
@RequestMapping("/api/mcp/oauth")
@RequiredArgsConstructor
public class McpOAuthCallbackController {

    private final McpOAuthService mcpOAuthService;
    private final McpOAuthSettings settings;

    @GetMapping("/callback")
    public ResponseEntity<Void> callback(
        @RequestParam(required = false) String code,
        @RequestParam(required = false) String state,
        @RequestParam(required = false) String error,
        @RequestParam(required = false) String iss,
        @RequestParam(name = "error_description", required = false) String errorDescription,
        @RequestParam(name = "admin_consent", required = false) String adminConsent
    ) {
        // L'administrateur d'une entreprise vient d'accorder notre application chez Microsoft (TF-J2-14) : pas de flux de
        // connexion à finir, l'app tout court.
        if (adminConsent != null && (state == null || state.isBlank())) {
            return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(settings.appBase() + "/")).build();
        }
        String redirect = mcpOAuthService.callback(state, code, error, iss, errorDescription);
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(redirect)).build();
    }

    /** Le document de métadonnées client du serveur : son adresse est l'identifiant de TaskForce. */
    @GetMapping(value = "/client.json", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> serverClient() {
        return document(settings.serverCimdUrl(), List.of(settings.redirectUri()), "web");
    }

    /** Le document de l'app desktop : un client public, natif, dont le retour se fait sur la boucle locale. */
    @GetMapping(value = "/desktop-client.json", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> desktopClient() {
        return document(settings.desktopCimdUrl(), McpOAuthSettings.desktopRedirectUris(), "native");
    }

    private ResponseEntity<Map<String, Object>> document(String clientId, List<String> redirectUris, String type) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("client_id", clientId);
        doc.put("client_name", settings.clientName());
        doc.put("client_uri", "https://taskforce-project.fr");
        doc.put("redirect_uris", redirectUris);
        doc.put("grant_types", List.of("authorization_code", "refresh_token"));
        doc.put("response_types", List.of("code"));
        doc.put("token_endpoint_auth_method", "none");
        doc.put("application_type", type);
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(java.time.Duration.ofHours(1))).body(doc);
    }
}
