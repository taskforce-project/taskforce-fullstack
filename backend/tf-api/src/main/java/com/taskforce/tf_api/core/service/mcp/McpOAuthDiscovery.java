package com.taskforce.tf_api.core.service.mcp;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.taskforce.tf_api.shared.exception.BusinessException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Decouverte OAuth 2.1 d'un serveur MCP (TF-MCP-02, norme MCP du 28/07/2026) : trouve le serveur d'autorisation et ses
 * endpoints sans rien coder de specifique au service.
 *
 * <ol>
 *   <li>probe non authentifie du serveur MCP -> {@code 401} + en-tete {@code WWW-Authenticate} pointant la
 *       <b>Protected Resource Metadata</b> (RFC 9728) et, parfois, les portees qu'il demande ; sinon les emplacements
 *       standard, avec le chemin du serveur puis a la racine ;</li>
 *   <li>la PRM donne le serveur d'autorisation et l'identifiant du serveur ({@code resource}), qui doit designer le
 *       serveur appele ; a defaut, le serveur MCP est son propre serveur d'autorisation ;</li>
 *   <li>la <b>Authorization Server Metadata</b> (RFC 8414 avec insertion du chemin, sinon OpenID Connect) donne les
 *       endpoints ; son {@code issuer} doit etre celui qui a servi a la trouver, et elle doit annoncer PKCE S256 :
 *       sinon TaskForce refuse de s'y connecter.</li>
 * </ol>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class McpOAuthDiscovery {

    private static final Pattern RESOURCE_METADATA = Pattern.compile("resource_metadata=\"?([^\",\\s]+)\"?");
    private static final Pattern SCOPE = Pattern.compile("(?:^|[\\s,])scope=\"([^\"]*)\"");

    private final McpOAuthClient client;

    /** Le serveur ne publie aucun flux OAuth : il se connecte par une clé, ou il est public. */
    public static class NoOAuth extends BusinessException {
        public NoOAuth(String mcpUrl) {
            super("OAuth metadata not found for " + mcpUrl + " (the server exposes no OAuth flow?)");
        }
    }

    /** Endpoints resolus du serveur d'autorisation d'un serveur MCP. */
    public record DiscoveredAuth(
        String issuer,
        String authorizationEndpoint,
        String tokenEndpoint,
        String registrationEndpoint,
        String scopesSupported,
        /** L'identifiant du serveur MCP a envoyer en {@code resource} (RFC 8707). */
        String resource,
        /** Les portees que le serveur demande dans son 401 ; nulles s'il n'en dit rien. */
        String challengeScope,
        String revocationEndpoint,
        /** Le serveur d'autorisation accepte un document de metadonnees comme identifiant de client (CIMD). */
        boolean cimdSupported,
        /** Le serveur d'autorisation rend {@code iss} au retour (RFC 9207) : il est alors exige. */
        boolean issParameterSupported
    ) {
        /** Forme courte des essais : un serveur sans PRM, sans CIMD ni {@code iss}. */
        public DiscoveredAuth(String issuer, String authorizationEndpoint, String tokenEndpoint,
                              String registrationEndpoint, String scopesSupported) {
            this(issuer, authorizationEndpoint, tokenEndpoint, registrationEndpoint, scopesSupported, null, null, null,
                false, false);
        }
    }

    public DiscoveredAuth discover(String mcpUrl) {
        // 1. Protected Resource Metadata (et les portees du 401)
        String header = client.probeWwwAuthenticate(mcpUrl);
        JsonNode prm = fetchPrm(mcpUrl, header);
        String resource = resource(prm, mcpUrl);
        // 2. Serveur d'autorisation (sinon le serveur MCP est son propre AS)
        String asUrl = authServerFromPrm(prm);
        if (asUrl == null || asUrl.isBlank()) asUrl = origin(mcpUrl);
        // 3. Authorization Server Metadata (RFC 8414, sinon OIDC), avec le chemin de l'emetteur
        JsonNode as = null;
        for (String candidate : asMetadataUrls(asUrl)) {
            as = client.getJsonOrNull(candidate);
            if (as != null && as.isObject()) break;
            as = null;
        }
        if (as == null) throw new NoOAuth(mcpUrl);
        String issuer = text(as, "issuer");
        if (issuer == null || !sameIssuer(issuer, asUrl)) {
            throw new BusinessException("The sign-in server of " + mcpUrl + " does not identify itself as " + asUrl
                + ": TaskForce does not connect to it.");
        }
        String authEp = text(as, "authorization_endpoint");
        String tokenEp = text(as, "token_endpoint");
        if (authEp == null || tokenEp == null) {
            throw new BusinessException("Incomplete OAuth endpoints for " + mcpUrl);
        }
        if (!supportsS256(as)) {
            throw new BusinessException("The sign-in server of " + mcpUrl + " does not announce PKCE (S256): "
                + "TaskForce can't sign in to it safely.");
        }
        return new DiscoveredAuth(issuer, authEp, tokenEp, text(as, "registration_endpoint"), scopes(prm, as),
            resource, challengeScope(header), text(as, "revocation_endpoint"),
            as.path("client_id_metadata_document_supported").asBoolean(false),
            as.path("authorization_response_iss_parameter_supported").asBoolean(false));
    }

    /**
     * Le serveur d'autorisation d'un outil servi par l'API de son éditeur (Google Drive, Microsoft Graph), sans serveur
     * MCP devant : sa metadata (RFC 8414, sinon OpenID Connect), avec les mêmes exigences qu'un serveur MCP (l'émetteur qui
     * se nomme comme on l'a trouvé, PKCE S256). Sans {@code resource} : ces éditeurs n'en veulent pas.
     */
    public DiscoveredAuth discoverIssuer(String issuerUrl) {
        JsonNode as = null;
        for (String candidate : asMetadataUrls(issuerUrl)) {
            as = client.getJsonOrNull(candidate);
            if (as != null && as.isObject()) break;
            as = null;
        }
        if (as == null) throw new NoOAuth(issuerUrl);
        String issuer = text(as, "issuer");
        if (issuer == null || !sameIssuer(issuer, issuerUrl)) {
            throw new BusinessException("The sign-in server " + issuerUrl + " does not identify itself as such: "
                + "TaskForce does not connect to it.");
        }
        String authEp = text(as, "authorization_endpoint");
        String tokenEp = text(as, "token_endpoint");
        if (authEp == null || tokenEp == null) {
            throw new BusinessException("Incomplete OAuth endpoints for " + issuerUrl);
        }
        if (!supportsS256(as)) {
            throw new BusinessException("The sign-in server " + issuerUrl + " does not announce PKCE (S256): "
                + "TaskForce can't sign in to it safely.");
        }
        return new DiscoveredAuth(issuer, authEp, tokenEp, null, null, null, null, text(as, "revocation_endpoint"),
            false, as.path("authorization_response_iss_parameter_supported").asBoolean(false));
    }

    // -------------------------------------------------------------------------

    private JsonNode fetchPrm(String mcpUrl, String header) {
        if (header != null) {
            Matcher m = RESOURCE_METADATA.matcher(header);
            if (m.find()) {
                JsonNode prm = client.getJsonOrNull(m.group(1));
                if (prm != null) return prm;
            }
        }
        // Emplacements standard de la PRM : avec le chemin du serveur, puis a la racine (RFC 9728, §3.1).
        String path = path(mcpUrl);
        if (!path.isEmpty()) {
            JsonNode prm = client.getJsonOrNull(origin(mcpUrl) + "/.well-known/oauth-protected-resource" + path);
            if (prm != null) return prm;
        }
        return client.getJsonOrNull(origin(mcpUrl) + "/.well-known/oauth-protected-resource");
    }

    /**
     * L'identifiant que la PRM donne au serveur : il doit designer le serveur appele (meme origine, et un chemin qui
     * le contient), sinon c'est la metadata d'un autre serveur. Sans PRM, l'adresse appelee.
     */
    static String resource(JsonNode prm, String mcpUrl) {
        String declared = prm == null ? null : text(prm, "resource");
        if (declared == null) return mcpUrl;
        String a = strip(declared);
        String b = strip(mcpUrl);
        if (!origin(a).equalsIgnoreCase(origin(b)) || !(b.equals(a) || b.startsWith(a + "/") || a.equals(origin(a)))) {
            throw new BusinessException("The server at " + mcpUrl + " describes another server (" + declared
                + "): TaskForce does not connect to it.");
        }
        return declared;
    }

    private String authServerFromPrm(JsonNode prm) {
        if (prm == null) return null;
        JsonNode servers = prm.path("authorization_servers");
        return (servers.isArray() && !servers.isEmpty()) ? servers.get(0).asText(null) : null;
    }

    /**
     * Les adresses de la metadata d'un emetteur (RFC 8414, §3.1 ; norme MCP) : pour {@code https://h/p},
     * {@code /.well-known/oauth-authorization-server/p}, {@code /.well-known/openid-configuration/p}, puis
     * {@code /p/.well-known/openid-configuration} ; sans chemin, les deux documents a la racine.
     */
    static List<String> asMetadataUrls(String issuer) {
        String origin = origin(issuer);
        String path = path(issuer);
        List<String> out = new ArrayList<>();
        if (path.isEmpty()) {
            out.add(origin + "/.well-known/oauth-authorization-server");
            out.add(origin + "/.well-known/openid-configuration");
        } else {
            out.add(origin + "/.well-known/oauth-authorization-server" + path);
            out.add(origin + "/.well-known/openid-configuration" + path);
            out.add(origin + path + "/.well-known/openid-configuration");
        }
        return out;
    }

    private static boolean supportsS256(JsonNode as) {
        JsonNode methods = as.path("code_challenge_methods_supported");
        if (!methods.isArray()) return false;
        for (JsonNode m : methods) if ("S256".equals(m.asText())) return true;
        return false;
    }

    private static String challengeScope(String header) {
        if (header == null) return null;
        Matcher m = SCOPE.matcher(header);
        return m.find() && !m.group(1).isBlank() ? m.group(1).trim() : null;
    }

    private String scopes(JsonNode prm, JsonNode as) {
        JsonNode s = (prm != null && prm.has("scopes_supported")) ? prm.get("scopes_supported")
                                                                   : as.path("scopes_supported");
        if (s != null && s.isArray() && !s.isEmpty()) {
            List<String> out = new ArrayList<>();
            s.forEach(n -> out.add(n.asText()));
            return String.join(" ", out);
        }
        return null;
    }

    private static boolean sameIssuer(String a, String b) {
        return strip(a).equals(strip(b));
    }

    private static String strip(String url) {
        String v = url.trim();
        while (v.endsWith("/")) v = v.substring(0, v.length() - 1);
        return v;
    }

    private static String text(JsonNode node, String field) {
        String v = node.path(field).asText(null);
        return (v == null || v.isBlank()) ? null : v;
    }

    /** Le chemin d'une URL, sans barre finale ({@code ""} a la racine). */
    private static String path(String url) {
        String p = URI.create(url.trim()).getRawPath();
        if (p == null) return "";
        while (p.endsWith("/")) p = p.substring(0, p.length() - 1);
        return p;
    }

    private static String origin(String url) {
        URI u = URI.create(url.trim());
        String port = u.getPort() > 0 ? ":" + u.getPort() : "";
        return u.getScheme() + "://" + u.getHost() + port;
    }
}
