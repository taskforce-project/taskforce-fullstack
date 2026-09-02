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
 * Decouverte OAuth 2.1 d'un serveur MCP (TF-MCP-02) : trouve le serveur d'autorisation et ses
 * endpoints sans rien coder de specifique au service.
 *
 * <ol>
 *   <li>probe non authentifie du serveur MCP -> {@code 401} + en-tete {@code WWW-Authenticate}
 *       pointant la <b>Protected Resource Metadata</b> (RFC 9728), sinon le well-known standard ;</li>
 *   <li>la PRM donne le(s) <b>authorization server(s)</b> ; a defaut, on suppose que le serveur MCP
 *       est son propre AS ;</li>
 *   <li>la <b>Authorization Server Metadata</b> (RFC 8414, sinon OpenID Connect) donne
 *       {@code authorization_endpoint} / {@code token_endpoint} / {@code registration_endpoint}.</li>
 * </ol>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class McpOAuthDiscovery {

    private static final Pattern RESOURCE_METADATA =
        Pattern.compile("resource_metadata=\"?([^\",\\s]+)\"?");

    private final McpOAuthClient client;

    /** Endpoints resolus du serveur d'autorisation d'un serveur MCP. */
    public record DiscoveredAuth(
        String issuer,
        String authorizationEndpoint,
        String tokenEndpoint,
        String registrationEndpoint,
        String scopesSupported
    ) {}

    public DiscoveredAuth discover(String mcpUrl) {
        // 1. Protected Resource Metadata
        JsonNode prm = fetchPrm(mcpUrl);
        // 2. Serveur d'autorisation (sinon le serveur MCP est son propre AS)
        String asBase = authServerFromPrm(prm);
        if (asBase == null || asBase.isBlank()) asBase = origin(mcpUrl);
        // 3. Authorization Server Metadata (RFC 8414, sinon OIDC)
        JsonNode as = client.getJsonOrNull(wellKnown(asBase, "oauth-authorization-server"));
        if (as == null) as = client.getJsonOrNull(wellKnown(asBase, "openid-configuration"));
        if (as == null) {
            throw new BusinessException("Metadata OAuth introuvable pour " + mcpUrl
                + " (le serveur n'expose pas de flux OAuth ?)");
        }
        String authEp = text(as, "authorization_endpoint");
        String tokenEp = text(as, "token_endpoint");
        if (authEp == null || tokenEp == null) {
            throw new BusinessException("Endpoints OAuth incomplets pour " + mcpUrl);
        }
        return new DiscoveredAuth(
            as.path("issuer").asText(asBase),
            authEp, tokenEp, text(as, "registration_endpoint"),
            scopes(prm, as));
    }

    // -------------------------------------------------------------------------

    private JsonNode fetchPrm(String mcpUrl) {
        String header = client.probeWwwAuthenticate(mcpUrl);
        if (header != null) {
            Matcher m = RESOURCE_METADATA.matcher(header);
            if (m.find()) {
                JsonNode prm = client.getJsonOrNull(m.group(1));
                if (prm != null) return prm;
            }
        }
        // Fallback : emplacement standard de la PRM.
        return client.getJsonOrNull(wellKnown(mcpUrl, "oauth-protected-resource"));
    }

    private String authServerFromPrm(JsonNode prm) {
        if (prm == null) return null;
        JsonNode servers = prm.path("authorization_servers");
        return (servers.isArray() && !servers.isEmpty()) ? servers.get(0).asText(null) : null;
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

    private static String text(JsonNode node, String field) {
        String v = node.path(field).asText(null);
        return (v == null || v.isBlank()) ? null : v;
    }

    /** Well-known a l'origine (schema://host[:port]) - couvre les AS hebergees a la racine. */
    private static String wellKnown(String base, String doc) {
        return origin(base) + "/.well-known/" + doc;
    }

    private static String origin(String url) {
        URI u = URI.create(url.trim());
        String port = u.getPort() > 0 ? ":" + u.getPort() : "";
        return u.getScheme() + "://" + u.getHost() + port;
    }
}
