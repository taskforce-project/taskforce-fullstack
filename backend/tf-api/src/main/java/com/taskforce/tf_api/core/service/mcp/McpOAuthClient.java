package com.taskforce.tf_api.core.service.mcp;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.util.LogSafe;
import com.taskforce.tf_api.shared.security.SsrfGuard;

import lombok.extern.slf4j.Slf4j;

/**
 * Client HTTP minimal du flux OAuth MCP (metadata de decouverte, Dynamic Client Registration,
 * echange, refresh et revocation de token). Ecrit sur le JDK {@link HttpClient} (aucune dep ajoutee).
 *
 * <p><b>Anti-SSRF</b> : chaque URL - fournie par l'utilisateur OU derivee de la metadata d'un
 * serveur tiers - passe par {@link SsrfGuard#assertPublicHttpUrl} AVANT l'appel. Impossible
 * d'atteindre une adresse de bouclage / privee / link-local (metadonnees cloud) / Tailscale, y
 * compris via un nom qui resout en interne (defense contre le DNS rebinding). La garde ne se leve
 * jamais en production : seul le constructeur des essais de contrat (faux serveur sur 127.0.0.1)
 * l'ouvre.
 */
@Component
@Slf4j
public class McpOAuthClient {

    /** Une erreur OAuth rendue par le serveur d'autorisation ({@code error} de RFC 6749, ex. {@code invalid_grant}). */
    public static class OAuthError extends BusinessException {
        private final String error;
        private final int status;

        public OAuthError(String message, String error, int status) {
            this("BUSINESS_ERROR", message, error, status);
        }

        /** Une erreur OAuth qui dit aussi pourquoi la connexion n'a pas abouti ({@link ConnectFailure}). */
        public OAuthError(String code, String message, String error, int status) {
            super(code, message);
            this.error = error;
            this.status = status;
        }

        public String error() {
            return error;
        }

        public int status() {
            return status;
        }

        /** Le serveur refuse le jeton de renouvellement ou le client : il faut se reconnecter. */
        public boolean needsReconnect() {
            return "invalid_grant".equals(error) || "invalid_client".equals(error)
                || "unauthorized_client".equals(error) || status == 401;
        }
    }

    /** Ce que répond un serveur MCP sans jeton : son statut et l'en-tête {@code WWW-Authenticate}. */
    public record Probe(int status, String wwwAuthenticate) {
        /** Le serveur demande une connexion OAuth. */
        public boolean asksForAuth() {
            return status == 401;
        }

        /** Le serveur répond sans connexion (serveur public). */
        public boolean open() {
            return status / 100 == 2;
        }
    }

    private final HttpClient http;
    private final ObjectMapper objectMapper;
    private final Duration timeout;
    private final boolean allowPrivateNetwork;

    @Autowired
    public McpOAuthClient(ObjectMapper objectMapper,
                          @Value("${integrations.mcp.oauth.http-timeout-ms:15000}") long timeoutMs) {
        this(objectMapper, timeoutMs, false);
    }

    /** Essais de contrat seulement : un faux serveur d'autorisation sur 127.0.0.1. */
    McpOAuthClient(ObjectMapper objectMapper, long timeoutMs, boolean allowPrivateNetwork) {
        this.objectMapper = objectMapper;
        this.timeout = Duration.ofMillis(timeoutMs);
        this.allowPrivateNetwork = allowPrivateNetwork;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    /** GET JSON ; renvoie {@code null} si non-2xx (metadata absente a cette URL = on tente une autre). */
    public JsonNode getJsonOrNull(String url) {
        try {
            HttpResponse<String> r = send(HttpRequest.newBuilder().GET(), url, "application/json");
            if (r.statusCode() / 100 != 2) return null;
            return objectMapper.readTree(r.body());
        } catch (Exception e) {
            log.debug("GET metadata {} echoue : {}", LogSafe.of(url), LogSafe.of(e.getMessage()));
            return null;
        }
    }

    /** POST JSON -> JSON (Dynamic Client Registration). Leve {@link BusinessException} sur echec. */
    public JsonNode postJson(String url, Object body) {
        try {
            String json = objectMapper.writeValueAsString(body);
            HttpResponse<String> r = send(
                HttpRequest.newBuilder().POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
                    .header("Content-Type", "application/json"),
                url, "application/json");
            JsonNode node = readJson(r);
            // Un 5xx : l'inscription de l'éditeur ne répond pas ; elle ne refuse rien (R159).
            requireSuccess(r, node, "DCR " + url,
                r.statusCode() / 100 == 5 ? ConnectFailure.SIGN_IN_UNREACHABLE : ConnectFailure.REGISTRATION_REFUSED);
            return node;
        } catch (BusinessException be) {
            throw be;
        } catch (IllegalArgumentException e) {
            // L'adresse d'inscription vient des métadonnées de l'éditeur : refusée, c'est sa connexion qui n'est pas sûre.
            throw ConnectFailure.refused(ConnectFailure.SIGN_IN_UNTRUSTED, "OAuth DCR " + url + " refused: " + e.getMessage());
        } catch (Exception e) {
            throw ConnectFailure.of(ConnectFailure.SIGN_IN_UNREACHABLE, "OAuth DCR " + url + " failed: " + e.getMessage());
        }
    }

    /** POST form-urlencoded -> JSON (echange du code / refresh). Leve {@link OAuthError} sur echec. */
    public JsonNode postForm(String url, Map<String, String> form) {
        try {
            HttpResponse<String> r = sendForm(url, form);
            JsonNode node = readJson(r);
            requireSuccess(r, node, "token " + url, "BUSINESS_ERROR");
            return node;
        } catch (BusinessException be) {
            throw be;
        } catch (IllegalArgumentException e) {
            // L'adresse d'échange des jetons vient de l'éditeur, comme celle de son inscription (R159).
            throw ConnectFailure.refused(ConnectFailure.SIGN_IN_UNTRUSTED, "OAuth token " + url + " refused: " + e.getMessage());
        } catch (Exception e) {
            throw ConnectFailure.of(ConnectFailure.SIGN_IN_UNREACHABLE, "OAuth token " + url + " failed: " + e.getMessage());
        }
    }

    /**
     * POST form-urlencoded dont seul le statut compte : la revocation (RFC 7009), qui repond 200 meme pour un jeton
     * deja invalide. Renvoie le statut, ou -1 si le serveur ne repond pas.
     */
    public int postFormStatus(String url, Map<String, String> form) {
        try {
            return sendForm(url, form).statusCode();
        } catch (Exception e) {
            log.debug("POST {} echoue : {}", LogSafe.of(url), LogSafe.of(e.getMessage()));
            return -1;
        }
    }

    /**
     * Requete MCP non authentifiee ({@code initialize}) : un {@code 401} et son en-tete {@code WWW-Authenticate}
     * (qui pointe la Protected Resource Metadata, RFC 9728) disent qu'il faut se connecter ; un {@code 2xx}, que le
     * serveur est public. Statut -1 si le serveur ne repond pas.
     */
    public Probe probe(String mcpUrl) {
        try {
            String init = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":"
                + "{\"protocolVersion\":\"" + McpClient.PROTOCOL_VERSION + "\",\"capabilities\":{},"
                + "\"clientInfo\":{\"name\":\"taskforce\",\"version\":\"0.1.0\"}}}";
            HttpResponse<String> r = send(
                HttpRequest.newBuilder().POST(HttpRequest.BodyPublishers.ofString(init, StandardCharsets.UTF_8))
                    .header("Content-Type", "application/json"),
                mcpUrl, "application/json, text/event-stream");
            return new Probe(r.statusCode(), r.headers().firstValue("WWW-Authenticate").orElse(""));
        } catch (Exception e) {
            log.debug("Probe MCP {} echoue : {}", LogSafe.of(mcpUrl), LogSafe.of(e.getMessage()));
            return new Probe(-1, "");
        }
    }

    /** L'en-tete {@code WWW-Authenticate} d'un 401 (peut etre vide), ou {@code null} si pas de 401. */
    public String probeWwwAuthenticate(String mcpUrl) {
        Probe p = probe(mcpUrl);
        return p.asksForAuth() ? p.wwwAuthenticate() : null;
    }

    // -------------------------------------------------------------------------

    private HttpResponse<String> sendForm(String url, Map<String, String> form) throws Exception {
        String body = form.entrySet().stream()
            .map(e -> enc(e.getKey()) + "=" + enc(e.getValue()))
            .collect(Collectors.joining("&"));
        return send(
            HttpRequest.newBuilder().POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .header("Content-Type", "application/x-www-form-urlencoded"),
            url, "application/json");
    }

    private HttpResponse<String> send(HttpRequest.Builder b, String url, String accept) throws Exception {
        // Bloque toute cible interne AVANT l'appel ; les essais de contrat seuls admettent leur faux serveur local.
        if (!allowPrivateNetwork) SsrfGuard.assertPublicHttpUrl(url);
        HttpRequest req = b.uri(URI.create(url)).timeout(timeout).header("Accept", accept).build();
        return http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    private JsonNode readJson(HttpResponse<String> r) {
        String body = r.body();
        if (body == null || body.isBlank()) return objectMapper.createObjectNode();
        try {
            return objectMapper.readTree(body);
        } catch (Exception e) {
            // Certains serveurs repondent en formulaire (access_token=...&scope=...) malgre l'en-tete Accept.
            return objectMapper.valueToTree(parseForm(body));
        }
    }

    private static Map<String, String> parseForm(String body) {
        Map<String, String> out = new java.util.LinkedHashMap<>();
        for (String pair : body.split("&")) {
            int eq = pair.indexOf('=');
            if (eq <= 0) continue;
            out.put(java.net.URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                java.net.URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
        }
        return out;
    }

    private void requireSuccess(HttpResponse<String> r, JsonNode node, String ctx, String code) {
        // Un 200 qui porte une erreur OAuth (GitHub rend ainsi un code perime) reste un echec.
        String error = node.path("error").asText("");
        if (r.statusCode() / 100 != 2 || !error.isBlank()) {
            String err = error.isBlank() ? node.path("error_description").asText("") : error;
            throw new OAuthError(code, "OAuth " + ctx + " : HTTP " + r.statusCode() + (err.isBlank() ? "" : " (" + err + ")"),
                error.isBlank() ? null : error, r.statusCode());
        }
    }

    private static String enc(String s) {
        return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8);
    }
}
