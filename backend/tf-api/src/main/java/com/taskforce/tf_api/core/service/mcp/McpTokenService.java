package com.taskforce.tf_api.core.service.mcp;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.ConnectionState;
import com.taskforce.tf_api.core.model.ConnectorApp;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.repository.ConnectorAppRepository;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;
import com.taskforce.tf_api.core.service.integration.ConnectorCatalog;
import com.taskforce.tf_api.core.service.integration.ConnectorPreset;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Gestion des tokens OAuth d'une connexion MCP (TF-MCP-02, séance n°22 R158) : stockage (au callback),
 * <b>refresh automatique</b> (avant expiration) et <b>révocation</b> chez l'éditeur (RFC 7009). Les tokens vivent
 * dans le {@code config} JSON <b>chiffre</b> de la {@link ConnectorConnection}, avec l'émetteur qui les a rendus :
 * ils ne servent qu'au serveur pour lequel ils ont été obtenus, et le renouvellement passe par l'endpoint de cet
 * émetteur. Le secret d'un client enregistré d'avance (celui de l'entreprise, ou le nôtre) ne part, au renouvellement
 * comme à la révocation, que vers l'émetteur épinglé ({@link #secretGoesTo}).
 *
 * <p>Un renouvellement garde le nouveau jeton de renouvellement quand l'éditeur le fait tourner (norme MCP : un client
 * public doit suivre la rotation) ; deux renouvellements de la même connexion ne se croisent pas, sinon le second
 * présenterait un jeton déjà tourné. Un refus définitif ({@code invalid_grant}) passe la connexion à
 * {@link ConnectionState#NEEDS_RECONNECT} : la personne voit « Needs reconnecting ».</p>
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
    static final String K_REVOKE_EP    = "mcpRevocationEndpoint";
    static final String K_CLIENT_SOURCE = "mcpClientSource";
    static final String K_RESOURCE     = "mcpResource";      // = resource (RFC 8707), tel que la PRM le declare
    static final String K_MCP_URL      = "mcpUrl";
    /** Un outil servi par l'API de son éditeur (Google Drive, Microsoft Graph) : pas de {@code resource}, et ses portées. */
    static final String K_API          = "apiKind";
    static final String K_GRANTED      = "apiScope";
    // Clés de WorkspaceMcpService : nom d'un serveur personnalisé, jeton collé et son en-tête.
    static final String K_MCP_NAME      = WorkspaceMcpService.CONFIG_NAME;
    static final String K_PASTED_TOKEN  = WorkspaceMcpService.CONFIG_TOKEN;
    static final String K_PASTED_HEADER = WorkspaceMcpService.CONFIG_HEADER;

    /** On rafraichit 60 s avant l'expiration reelle (marge d'horloge + latence). */
    private static final long REFRESH_SKEW_MS = 60_000;

    private final McpOAuthClient client;
    private final ConnectorConnectionRepository repository;
    private final ObjectMapper objectMapper;
    private final ConnectorCatalog catalog;
    private final ConnectorAppRepository apps;

    /** Un verrou par connexion : deux renouvellements ne présentent jamais le même jeton tourné. */
    private final Map<Long, Object> locks = new ConcurrentHashMap<>();
    /** Le dernier jeton rendu par un renouvellement, par connexion, pour qui attendait le verrou. */
    private final Map<Long, Fresh> fresh = new ConcurrentHashMap<>();

    private record Fresh(String config, long expiresAt) {}

    /** La connexion est-elle branchee via OAuth (access token gere) ? */
    public boolean isOAuth(Map<String, String> config) {
        return config != null && config.get(K_OAUTH_ISSUER) != null && config.get(K_ACCESS) != null;
    }

    /**
     * Access token valide pour une connexion OAuth : rafraichi (et persiste) s'il est expire ou proche de l'etre.
     * Renvoie {@code null} si la connexion n'est pas OAuth, ou si l'éditeur refuse le renouvellement (la connexion est
     * alors à refaire). Sur une panne passagère du renouvellement, le token courant.
     */
    @Transactional
    public String validAccessToken(ConnectorConnection conn) {
        return token(conn, false);
    }

    /**
     * Renouvelle tout de suite, quel que soit l'âge du jeton : le serveur vient de le refuser (401). Renvoie le nouveau
     * jeton, ou {@code null} quand la connexion est à refaire (pas de renouvellement possible, ou refusé).
     */
    @Transactional
    public String refreshNow(ConnectorConnection conn) {
        String token = token(conn, true);
        Map<String, String> config = read(conn.getConfig());
        if (token != null && token.equals(config.get(K_ACCESS)) && config.get(K_REFRESH) == null) {
            conn.setState(ConnectionState.NEEDS_RECONNECT);
            repository.save(conn);
            return null;
        }
        return token;
    }

    private String token(ConnectorConnection conn, boolean force) {
        Map<String, String> config = read(conn.getConfig());
        if (!isOAuth(config)) return null;
        if (!force && stillValid(config)) return config.get(K_ACCESS);
        Object lock = conn.getId() == null ? new Object() : locks.computeIfAbsent(conn.getId(), id -> new Object());
        synchronized (lock) {
            // Un autre appel vient peut-être de renouveler : on reprend son résultat plutôt que de re-présenter
            // un jeton de renouvellement déjà tourné.
            Fresh latest = conn.getId() == null ? null : fresh.get(conn.getId());
            if (!force && latest != null && latest.expiresAt() - System.currentTimeMillis() > REFRESH_SKEW_MS) {
                conn.setConfig(latest.config());
                return read(latest.config()).get(K_ACCESS);
            }
            if (latest != null) config = read(latest.config());
            String refresh = config.get(K_REFRESH);
            if (refresh == null || refresh.isBlank() || config.get(K_TOKEN_EP) == null) {
                return config.get(K_ACCESS); // pas de refresh possible : on tente le token courant
            }
            try {
                JsonNode tok = client.postForm(config.get(K_TOKEN_EP), refreshForm(conn, config, refresh));
                applyTokens(config, tok, refresh);
                String written = write(config);
                conn.setConfig(written);
                conn.setState(ConnectionState.CONNECTED);
                repository.save(conn);
                if (conn.getId() != null) fresh.put(conn.getId(), new Fresh(written, parseLong(config.get(K_EXPIRES))));
                return config.get(K_ACCESS);
            } catch (McpOAuthClient.OAuthError e) {
                if (!e.needsReconnect()) {
                    log.warn("Refresh token MCP '{}' echoue : {}", LogSafe.of(conn.getConnectorKey()), LogSafe.of(e.getMessage()));
                    return config.get(K_ACCESS);
                }
                log.warn("Refresh token MCP '{}' refuse : connexion a refaire ({})", LogSafe.of(conn.getConnectorKey()),
                    LogSafe.of(e.error()));
                conn.setState(ConnectionState.NEEDS_RECONNECT);
                repository.save(conn);
                return null;
            } catch (Exception e) {
                log.warn("Refresh token MCP '{}' echoue : {}", LogSafe.of(conn.getConnectorKey()), LogSafe.of(e.getMessage()));
                return config.get(K_ACCESS);
            }
        }
    }

    /**
     * Stocke, au callback, les tokens + les infos necessaires au refresh et a la revocation ulterieurs (+ mcpUrl si
     * neuf, + nom d'un serveur personnalise). Un jeton colle et son en-tete, laisses par une connexion precedente, sont
     * retires : l'OAuth les remplace.
     */
    @Transactional
    public void storeInitialTokens(ConnectorConnection conn, JsonNode tokenResponse, OAuthGrant grant) {
        Map<String, String> config = read(conn.getConfig());
        if (grant.mcpUrl() != null && !grant.mcpUrl().isBlank()) config.put(K_MCP_URL, grant.mcpUrl());
        if (grant.name() != null && !grant.name().isBlank()) config.put(K_MCP_NAME, grant.name());
        config.remove(K_PASTED_TOKEN);
        config.remove(K_PASTED_HEADER);
        config.remove(K_REFRESH);
        config.remove(K_EXPIRES);
        config.put(K_OAUTH_ISSUER, grant.issuer());
        config.put(K_CLIENT_ID, grant.clientId());
        if (grant.clientSecret() != null && !grant.clientSecret().isBlank()) config.put(K_CLIENT_SECRET, grant.clientSecret());
        else config.remove(K_CLIENT_SECRET);
        config.put(K_TOKEN_EP, grant.tokenEndpoint());
        putOrRemove(config, K_REVOKE_EP, grant.revocationEndpoint());
        putOrRemove(config, K_CLIENT_SOURCE, grant.clientSource());
        putOrRemove(config, K_RESOURCE, grant.resource());
        applyTokens(config, tokenResponse, null);
        conn.setConfig(write(config));
        conn.setState(ConnectionState.CONNECTED);
        repository.save(conn);
        if (conn.getId() != null) fresh.remove(conn.getId());
    }

    /**
     * Marque une connexion servie par l'API de son éditeur ({@code kind}), avec les portées qu'il a vraiment accordées :
     * l'écriture chez Microsoft dépend de ce que la personne, ou son administrateur, a accepté.
     */
    @Transactional
    public void markApi(ConnectorConnection conn, String kind, String grantedScope) {
        Map<String, String> config = read(conn.getConfig());
        config.put(K_API, kind);
        putOrRemove(config, K_GRANTED, grantedScope);
        conn.setConfig(write(config));
        repository.save(conn);
        if (conn.getId() != null) fresh.remove(conn.getId());
    }

    /** L'outil de cette connexion est-il servi par l'API de son éditeur ? Son genre, sinon nul. */
    public static String apiKind(Map<String, String> config) {
        return config == null ? null : config.get(K_API);
    }

    /** Les portées que l'éditeur a accordées à cette connexion, séparées par des espaces ; vide s'il ne l'a pas dit. */
    public String grantedScope(ConnectorConnection conn) {
        return read(conn.getConfig()).getOrDefault(K_GRANTED, "");
    }

    /** Ce que le retour du navigateur a obtenu, à garder avec les jetons. */
    public record OAuthGrant(String mcpUrl, String name, String issuer, String clientId, String clientSecret,
                             String tokenEndpoint, String revocationEndpoint, String clientSource, String resource) {}

    /**
     * Révoque les jetons d'une connexion OAuth chez l'éditeur (RFC 7009), quand il offre la révocation : le jeton de
     * renouvellement d'abord (sa révocation emporte les jetons d'accès), puis le jeton d'accès. Vrai si l'éditeur a
     * accepté ; faux s'il n'offre pas la révocation, si la connexion n'est pas OAuth, ou s'il ne répond pas.
     */
    public boolean revoke(ConnectorConnection conn) {
        Map<String, String> config = read(conn.getConfig());
        String endpoint = config.get(K_REVOKE_EP);
        if (!isOAuth(config) || endpoint == null || endpoint.isBlank()) return false;
        boolean revoked = false;
        String refresh = config.get(K_REFRESH);
        if (refresh != null && !refresh.isBlank()) revoked = revokeOne(endpoint, conn, config, refresh, "refresh_token");
        revoked |= revokeOne(endpoint, conn, config, config.get(K_ACCESS), "access_token");
        if (conn.getId() != null) fresh.remove(conn.getId());
        return revoked;
    }

    /**
     * Le secret gardé avec la connexion part-il vers son serveur d'autorisation ? Celui de l'entreprise ou le nôtre,
     * seulement vers l'émetteur épinglé : celui du serveur officiel du préréglage, ou l'émetteur de l'API de l'éditeur que
     * TaskForce sert ; pour un serveur que l'entreprise tient, celui épinglé sur son application, et pour une connexion
     * faite avant cet épinglage, l'émetteur qu'elle a gardé à sa connexion. Un secret d'inscription dynamique est celui que
     * cet émetteur a lui-même rendu.
     */
    boolean secretGoesTo(ConnectorConnection conn, Map<String, String> config) {
        String source = config.get(K_CLIENT_SOURCE);
        if (!McpClientRegistrar.COMPANY.equals(source) && !McpClientRegistrar.OURS.equals(source)) return true;
        ConnectorPreset preset = catalog.preset(conn.getConnectorKey()).orElse(null);
        if (preset == null) return false;
        if (config.get(K_API) != null) return preset.api() != null && preset.api().kind().equals(config.get(K_API));
        if (preset.hasOfficialServer()) return preset.serves(config.get(K_MCP_URL));
        if (!McpClientRegistrar.COMPANY.equals(source)) return false;
        String recorded = config.get(K_OAUTH_ISSUER);
        String pinned = conn.getWorkspace() == null ? null : apps
            .findByWorkspaceIdAndConnectorKey(conn.getWorkspace().getId(), conn.getConnectorKey())
            .map(ConnectorApp::getIssuer).orElse(null);
        return McpClientRegistrar.sameIssuer(pinned != null ? pinned : recorded, recorded);
    }

    private void putSecret(Map<String, String> form, ConnectorConnection conn, Map<String, String> config) {
        String secret = config.get(K_CLIENT_SECRET);
        if (secret == null) return;
        if (secretGoesTo(conn, config)) {
            form.put("client_secret", secret);
        } else {
            log.warn("Secret du client de '{}' non envoye : il ne part que vers l'emetteur epingle",
                LogSafe.of(conn.getConnectorKey()));
        }
    }

    /** Peut-on révoquer cette connexion chez l'éditeur ? */
    public boolean canRevoke(Map<String, String> config) {
        String endpoint = config == null ? null : config.get(K_REVOKE_EP);
        return isOAuth(config) && endpoint != null && !endpoint.isBlank();
    }

    // -------------------------------------------------------------------------

    private boolean revokeOne(String endpoint, ConnectorConnection conn, Map<String, String> config, String token,
                              String hint) {
        if (token == null || token.isBlank()) return false;
        Map<String, String> f = new LinkedHashMap<>();
        f.put("token", token);
        f.put("token_type_hint", hint);
        if (config.get(K_CLIENT_ID) != null) f.put("client_id", config.get(K_CLIENT_ID));
        putSecret(f, conn, config);
        int status = client.postFormStatus(endpoint, f);
        return status / 100 == 2;
    }

    private static boolean stillValid(Map<String, String> config) {
        long exp = parseLong(config.get(K_EXPIRES));
        return exp <= 0 || exp - System.currentTimeMillis() > REFRESH_SKEW_MS;
    }

    private void applyTokens(Map<String, String> config, JsonNode tok, String fallbackRefresh) {
        String access = tok.path("access_token").asText(null);
        if (access != null && !access.isBlank()) config.put(K_ACCESS, access);
        // Rotation : un nouveau jeton de renouvellement remplace l'ancien, qui ne doit plus servir.
        String refresh = tok.path("refresh_token").asText(null);
        if (refresh != null && !refresh.isBlank()) config.put(K_REFRESH, refresh);
        else if (fallbackRefresh != null) config.put(K_REFRESH, fallbackRefresh);
        // Les portées accordées, que l'éditeur redit au renouvellement (Microsoft) : seulement pour une API d'éditeur.
        String granted = tok.path("scope").asText(null);
        if (config.containsKey(K_API) && granted != null && !granted.isBlank()) config.put(K_GRANTED, granted);
        long expiresIn = tok.path("expires_in").asLong(0);
        if (expiresIn > 0) {
            config.put(K_EXPIRES, String.valueOf(System.currentTimeMillis() + expiresIn * 1000));
        } else {
            config.remove(K_EXPIRES);
        }
    }

    private Map<String, String> refreshForm(ConnectorConnection conn, Map<String, String> config, String refresh) {
        Map<String, String> f = new LinkedHashMap<>();
        f.put("grant_type", "refresh_token");
        f.put("refresh_token", refresh);
        if (config.get(K_CLIENT_ID) != null) f.put("client_id", config.get(K_CLIENT_ID));
        putSecret(f, conn, config);
        // L'API d'un éditeur (Google, Entra) refuse le paramètre resource (RFC 8707) : seulement pour un serveur MCP.
        if (config.get(K_API) == null) {
            String resource = config.get(K_RESOURCE) != null ? config.get(K_RESOURCE) : config.get(K_MCP_URL);
            if (resource != null) f.put("resource", resource);
        }
        return f;
    }

    private static void putOrRemove(Map<String, String> config, String key, String value) {
        if (value != null && !value.isBlank()) config.put(key, value);
        else config.remove(key);
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
