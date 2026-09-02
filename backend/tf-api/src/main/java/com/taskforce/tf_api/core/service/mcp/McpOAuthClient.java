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

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.security.SsrfGuard;

import lombok.extern.slf4j.Slf4j;

/**
 * Client HTTP minimal du flux OAuth MCP (metadata de decouverte, Dynamic Client Registration,
 * echange et refresh de token). Ecrit sur le JDK {@link HttpClient} (aucune dep ajoutee).
 *
 * <p><b>Anti-SSRF</b> : chaque URL - fournie par l'utilisateur OU derivee de la metadata d'un
 * serveur tiers - passe par {@link SsrfGuard#assertPublicHttpUrl} AVANT l'appel. Impossible
 * d'atteindre une adresse de bouclage / privee / link-local (metadonnees cloud) / Tailscale, y
 * compris via un nom qui resout en interne (defense contre le DNS rebinding).
 */
@Component
@Slf4j
public class McpOAuthClient {

    private final HttpClient http;
    private final ObjectMapper objectMapper;
    private final Duration timeout;

    public McpOAuthClient(ObjectMapper objectMapper,
                          @Value("${integrations.mcp.oauth.http-timeout-ms:15000}") long timeoutMs) {
        this.objectMapper = objectMapper;
        this.timeout = Duration.ofMillis(timeoutMs);
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    /** GET JSON ; renvoie {@code null} si non-2xx (metadata absente a cette URL = on tente une autre). */
    public JsonNode getJsonOrNull(String url) {
        try {
            HttpResponse<String> r = send(HttpRequest.newBuilder().GET(), url, "application/json");
            if (r.statusCode() / 100 != 2) return null;
            return objectMapper.readTree(r.body());
        } catch (Exception e) {
            log.debug("GET metadata {} echoue : {}", url, e.getMessage());
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
            requireSuccess(r, node, "DCR " + url);
            return node;
        } catch (BusinessException be) {
            throw be;
        } catch (Exception e) {
            throw new BusinessException("OAuth DCR " + url + " echoue : " + e.getMessage());
        }
    }

    /** POST form-urlencoded -> JSON (echange du code / refresh). Leve {@link BusinessException} sur echec. */
    public JsonNode postForm(String url, Map<String, String> form) {
        try {
            String body = form.entrySet().stream()
                .map(e -> enc(e.getKey()) + "=" + enc(e.getValue()))
                .collect(Collectors.joining("&"));
            HttpResponse<String> r = send(
                HttpRequest.newBuilder().POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .header("Content-Type", "application/x-www-form-urlencoded"),
                url, "application/json");
            JsonNode node = readJson(r);
            requireSuccess(r, node, "token " + url);
            return node;
        } catch (BusinessException be) {
            throw be;
        } catch (Exception e) {
            throw new BusinessException("OAuth token " + url + " echoue : " + e.getMessage());
        }
    }

    /**
     * Requete MCP non authentifiee ({@code initialize}) pour declencher un {@code 401} et lire
     * l'en-tete {@code WWW-Authenticate} (qui pointe la Protected Resource Metadata, RFC 9728).
     * Renvoie la valeur de l'en-tete (peut etre vide), ou {@code null} si pas de 401.
     */
    public String probeWwwAuthenticate(String mcpUrl) {
        try {
            String init = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":"
                + "{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{},"
                + "\"clientInfo\":{\"name\":\"taskforce\",\"version\":\"0.1.0\"}}}";
            HttpResponse<String> r = send(
                HttpRequest.newBuilder().POST(HttpRequest.BodyPublishers.ofString(init, StandardCharsets.UTF_8))
                    .header("Content-Type", "application/json"),
                mcpUrl, "application/json, text/event-stream");
            return r.statusCode() == 401 ? r.headers().firstValue("WWW-Authenticate").orElse("") : null;
        } catch (Exception e) {
            log.debug("Probe MCP {} echoue : {}", mcpUrl, e.getMessage());
            return null;
        }
    }

    // -------------------------------------------------------------------------

    private HttpResponse<String> send(HttpRequest.Builder b, String url, String accept) throws Exception {
        SsrfGuard.assertPublicHttpUrl(url); // bloque toute cible interne AVANT l'appel
        HttpRequest req = b.uri(URI.create(url)).timeout(timeout).header("Accept", accept).build();
        return http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    private JsonNode readJson(HttpResponse<String> r) throws Exception {
        String body = r.body();
        return (body == null || body.isBlank())
            ? objectMapper.createObjectNode()
            : objectMapper.readTree(body);
    }

    private void requireSuccess(HttpResponse<String> r, JsonNode node, String ctx) {
        if (r.statusCode() / 100 != 2) {
            String err = node.path("error").asText(node.path("error_description").asText(""));
            throw new BusinessException("OAuth " + ctx + " : HTTP " + r.statusCode()
                + (err.isBlank() ? "" : " (" + err + ")"));
        }
    }

    private static String enc(String s) {
        return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8);
    }
}
