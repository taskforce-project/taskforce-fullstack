package com.taskforce.tf_api.core.service.mcp;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Gestion des tokens OAuth d'une connexion MCP (TF-MCP-02) : stockage (au callback) et
 * <b>refresh automatique</b> (avant expiration). Les tokens vivent dans le {@code config} JSON
 * <b>chiffre</b> de la {@link ConnectorConnection} - aucune colonne dediee.
 *
 * <p>Service <b>feuille</b> (deps : client HTTP + repo connexions) pour que {@code WorkspaceMcpService}
 * et {@code McpOAuthService} l'utilisent sans cycle.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class McpTokenService {

    // Cles dans le config JSON de la connexion. mcpUrl est deja pose par WorkspaceMcpService.
    static final String K_OAUTH_ISSUER = "mcpOAuthIssuer";
    static final String K_ACCESS       = "mcpAccessToken";
    static final String K_REFRESH      = "mcpRefreshToken";
    static final String K_EXPIRES      = "mcpExpiresAt";     // epoch millis
    static final String K_CLIENT_ID    = "mcpClientId";
    static final String K_CLIENT_SECRET = "mcpClientSecret";
    static final String K_TOKEN_EP     = "mcpTokenEndpoint";
    static final String K_MCP_URL      = "mcpUrl";           // = resource (RFC 8707)

    /** On rafraichit 60 s avant l'expiration reelle (marge d'horloge + latence). */
    private static final long REFRESH_SKEW_MS = 60_000;

    private final McpOAuthClient client;
    private final ConnectorConnectionRepository repository;
    private final ObjectMapper objectMapper;

    /** La connexion est-elle branchee via OAuth (access token gere) ? */
    public boolean isOAuth(Map<String, String> config) {
        return config != null && config.get(K_OAUTH_ISSUER) != null && config.get(K_ACCESS) != null;
    }

    /**
     * Access token valide pour une connexion OAuth : rafraichi (et persiste) s'il est expire ou
     * proche de l'etre. Renvoie {@code null} si la connexion n'est pas OAuth. Best-effort sur le
     * refresh : en cas d'echec, on renvoie le token courant plutot que de casser la decouverte.
     */
    @Transactional
    public String validAccessToken(ConnectorConnection conn) {
        Map<String, String> config = read(conn.getConfig());
        if (!isOAuth(config)) return null;

        long exp = parseLong(config.get(K_EXPIRES));
        if (exp > 0 && exp - System.currentTimeMillis() > REFRESH_SKEW_MS) {
            return config.get(K_ACCESS); // encore valide
        }
        String refresh = config.get(K_REFRESH);
        if (refresh == null || refresh.isBlank() || config.get(K_TOKEN_EP) == null) {
            return config.get(K_ACCESS); // pas de refresh possible : on tente le token courant
        }
        try {
            JsonNode tok = client.postForm(config.get(K_TOKEN_EP), refreshForm(config, refresh));
            applyTokens(config, tok, refresh);
            conn.setConfig(write(config));
            repository.save(conn);
            return config.get(K_ACCESS);
        } catch (Exception e) {
            log.warn("Refresh token MCP '{}' echoue : {}", conn.getConnectorKey(), e.getMessage());
            return config.get(K_ACCESS);
        }
    }

    /** Stocke, au callback, les tokens + les infos necessaires au refresh ulterieur (+ mcpUrl si neuf). */
    @Transactional
    public void storeInitialTokens(ConnectorConnection conn, JsonNode tokenResponse, String mcpUrl, String issuer,
                                   String clientId, String clientSecret, String tokenEndpoint) {
        Map<String, String> config = read(conn.getConfig());
        if (mcpUrl != null && !mcpUrl.isBlank()) config.put(K_MCP_URL, mcpUrl);
        config.put(K_OAUTH_ISSUER, issuer);
        config.put(K_CLIENT_ID, clientId);
        if (clientSecret != null && !clientSecret.isBlank()) config.put(K_CLIENT_SECRET, clientSecret);
        config.put(K_TOKEN_EP, tokenEndpoint);
        applyTokens(config, tokenResponse, null);
        conn.setConfig(write(config));
        repository.save(conn);
    }

    // -------------------------------------------------------------------------

    private void applyTokens(Map<String, String> config, JsonNode tok, String fallbackRefresh) {
        String access = tok.path("access_token").asText(null);
        if (access != null && !access.isBlank()) config.put(K_ACCESS, access);
        String refresh = tok.path("refresh_token").asText(null);
        if (refresh != null && !refresh.isBlank()) config.put(K_REFRESH, refresh);
        else if (fallbackRefresh != null) config.put(K_REFRESH, fallbackRefresh);
        long expiresIn = tok.path("expires_in").asLong(0);
        if (expiresIn > 0) {
            config.put(K_EXPIRES, String.valueOf(System.currentTimeMillis() + expiresIn * 1000));
        }
    }

    private Map<String, String> refreshForm(Map<String, String> config, String refresh) {
        Map<String, String> f = new LinkedHashMap<>();
        f.put("grant_type", "refresh_token");
        f.put("refresh_token", refresh);
        if (config.get(K_CLIENT_ID) != null) f.put("client_id", config.get(K_CLIENT_ID));
        if (config.get(K_CLIENT_SECRET) != null) f.put("client_secret", config.get(K_CLIENT_SECRET));
        if (config.get(K_MCP_URL) != null) f.put("resource", config.get(K_MCP_URL));
        return f;
    }

    private Map<String, String> read(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try {
            return objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, String>>() {});
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    private String write(Map<String, String> config) {
        try {
            return objectMapper.writeValueAsString(config);
        } catch (Exception e) {
            return "{}";
        }
    }

    private static long parseLong(String s) {
        try {
            return s == null ? 0L : Long.parseLong(s);
        } catch (NumberFormatException e) {
            return 0L;
        }
    }
}
