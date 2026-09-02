package com.taskforce.tf_api.core.service.mcp;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.model.McpOAuthState;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;
import com.taskforce.tf_api.core.repository.McpOAuthStateRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.mcp.McpOAuthDiscovery.DiscoveredAuth;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.security.SsrfGuard;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Flux OAuth 2.1 « 1-clic » pour connecter un serveur MCP (TF-MCP-02) : l'utilisateur clique, on
 * decouvre le serveur d'auth, on s'enregistre (DCR), on redirige vers le consentement, et au retour
 * on stocke les tokens - sans jamais lui faire coller de token. Une seule implementation, valable
 * pour tout serveur MCP conforme.
 *
 * <p>Securite : SsrfGuard sur l'URL fournie ; PKCE S256 ; {@code state} anti-CSRF resolvant le
 * workspace au callback ; tokens chiffres (via {@link McpTokenService}). Le callback <b>redirige
 * toujours</b> vers l'UI (succes ou erreur), jamais une erreur brute au navigateur.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class McpOAuthService {

    private static final Duration STATE_TTL = Duration.ofMinutes(10);

    private final McpOAuthDiscovery discovery;
    private final McpOAuthClient client;
    private final McpOAuthStateRepository stateRepository;
    private final ConnectorConnectionRepository connectionRepository;
    private final WorkspaceRepository workspaceRepository;
    private final McpTokenService tokenService;
    private final WorkspaceMcpService workspaceMcp;

    @Value("${integrations.mcp.oauth.redirect-base:http://localhost:8080}")
    private String redirectBase; // base publique du BACKEND (recoit le callback du fournisseur)
    @Value("${integrations.mcp.oauth.app-base:http://localhost:3000}")
    private String appBase;      // base du FRONT (retour utilisateur apres callback)
    @Value("${integrations.mcp.oauth.client-name:TaskForce}")
    private String clientName;

    private final SecureRandom random = new SecureRandom();

    /**
     * Demarre le flux et renvoie l'URL d'autorisation (le front y redirige le navigateur).
     * Autorisation (membre + BUSINESS+ + manager) faite en amont par le controleur.
     */
    @Transactional
    public String start(Workspace ws, Long userId, String connectorKey, String mcpUrl) {
        SsrfGuard.assertPublicHttpUrl(mcpUrl);
        DiscoveredAuth auth = discovery.discover(mcpUrl);
        String redirectUri = redirectBase + "/api/mcp/oauth/callback";

        if (auth.registrationEndpoint() == null) {
            throw new BusinessException("Ce serveur ne supporte pas l'enregistrement dynamique (DCR) : "
                + "connexion 1-clic indisponible, utilise l'URL + token.");
        }
        JsonNode reg = client.postJson(auth.registrationEndpoint(), dcrBody(redirectUri));
        String clientId = reg.path("client_id").asText(null);
        if (clientId == null || clientId.isBlank()) throw new BusinessException("DCR sans client_id");
        String clientSecret = reg.path("client_secret").asText(null);

        String verifier = urlSafe(48);
        String state = urlSafe(24);

        stateRepository.save(McpOAuthState.builder()
            .state(state).workspaceId(ws.getId()).userId(userId)
            .connectorKey(connectorKey).mcpUrl(mcpUrl).codeVerifier(verifier)
            .tokenEndpoint(auth.tokenEndpoint()).clientId(clientId).clientSecret(clientSecret)
            .redirectUri(redirectUri).scope(auth.scopesSupported()).issuer(auth.issuer())
            .expiresAt(LocalDateTime.now().plus(STATE_TTL))
            .build());

        return authorizeUrl(auth.authorizationEndpoint(), clientId, redirectUri,
            auth.scopesSupported(), state, s256(verifier), mcpUrl);
    }

    /**
     * Callback OAuth (endpoint public) : resout tout depuis le {@code state} (jamais l'URL), echange
     * le code, stocke les tokens, invalide le cache, et renvoie l'URL de retour vers l'UI.
     */
    @Transactional
    public String callback(String state, String code, String error) {
        McpOAuthState row = (state == null || state.isBlank()) ? null
            : stateRepository.findById(state).orElse(null);
        if (row == null) return appBase + "/?mcp=error"; // state inconnu/expire : retour generique
        try {
            if (error != null && !error.isBlank()) throw new BusinessException("refus : " + error);
            if (row.getExpiresAt().isBefore(LocalDateTime.now())) throw new BusinessException("state expire");
            if (code == null || code.isBlank()) throw new BusinessException("code manquant");

            JsonNode tok = client.postForm(row.getTokenEndpoint(), exchangeForm(row, code));

            ConnectorConnection conn = connectionRepository
                .findByWorkspaceIdAndConnectorKey(row.getWorkspaceId(), row.getConnectorKey())
                .orElseGet(() -> ConnectorConnection.builder()
                    .workspace(workspaceRepository.getReferenceById(row.getWorkspaceId()))
                    .connectorKey(row.getConnectorKey()).build());

            tokenService.storeInitialTokens(conn, tok, row.getMcpUrl(), row.getIssuer(),
                row.getClientId(), row.getClientSecret(), row.getTokenEndpoint());
            workspaceMcp.invalidate(row.getWorkspaceId());
            return appRedirect(row.getWorkspaceId(), "connected");
        } catch (Exception e) {
            log.warn("Callback OAuth MCP echoue (connector={}) : {}", row.getConnectorKey(), e.getMessage());
            return appRedirect(row.getWorkspaceId(), "error");
        } finally {
            stateRepository.deleteById(row.getState()); // usage unique
        }
    }

    // -------------------------------------------------------------------------

    private Map<String, Object> dcrBody(String redirectUri) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("client_name", clientName);
        m.put("redirect_uris", List.of(redirectUri));
        m.put("grant_types", List.of("authorization_code", "refresh_token"));
        m.put("response_types", List.of("code"));
        m.put("token_endpoint_auth_method", "none"); // client public (PKCE), pas de secret a garder
        m.put("application_type", "web");
        return m;
    }

    private Map<String, String> exchangeForm(McpOAuthState row, String code) {
        Map<String, String> f = new LinkedHashMap<>();
        f.put("grant_type", "authorization_code");
        f.put("code", code);
        f.put("redirect_uri", row.getRedirectUri());
        f.put("client_id", row.getClientId());
        if (row.getClientSecret() != null && !row.getClientSecret().isBlank()) {
            f.put("client_secret", row.getClientSecret());
        }
        f.put("code_verifier", row.getCodeVerifier());
        f.put("resource", row.getMcpUrl());
        return f;
    }

    private String authorizeUrl(String authEp, String clientId, String redirectUri, String scope,
                                String state, String challenge, String resource) {
        StringBuilder u = new StringBuilder(authEp)
            .append(authEp.contains("?") ? "&" : "?")
            .append("response_type=code")
            .append("&client_id=").append(enc(clientId))
            .append("&redirect_uri=").append(enc(redirectUri))
            .append("&state=").append(enc(state))
            .append("&code_challenge=").append(enc(challenge))
            .append("&code_challenge_method=S256")
            .append("&resource=").append(enc(resource));
        if (scope != null && !scope.isBlank()) u.append("&scope=").append(enc(scope));
        return u.toString();
    }

    private String appRedirect(Long workspaceId, String status) {
        String slug = workspaceRepository.findById(workspaceId).map(Workspace::getSlug).orElse("");
        return appBase + "/" + slug + "/settings?section=integrations&mcp=" + status;
    }

    private String urlSafe(int bytes) {
        byte[] b = new byte[bytes];
        random.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    private static String s256(String verifier) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(d);
        } catch (Exception e) {
            throw new BusinessException("PKCE indisponible : " + e.getMessage());
        }
    }

    private static String enc(String s) {
        return java.net.URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8);
    }
}
