package com.taskforce.tf_api.core.service.mcp;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.security.SsrfGuard;

import lombok.extern.slf4j.Slf4j;

/**
 * Client <b>MCP</b> (Model Context Protocol) minimal, transport <b>Streamable HTTP</b>, écrit main
 * sur le JDK {@link HttpClient} — aucune dépendance ajoutée (Spring AI vise Boot 3.x ; on est en
 * Boot 4). Permet à TaskForce (agent Cortex) d'être <b>hôte MCP</b> et de piloter des serveurs
 * externes (Linear & co) : {@code initialize} → {@code tools/list} → {@code tools/call}.
 *
 * <p>Gère les deux formes de réponse du protocole : JSON direct <i>ou</i> flux <b>SSE</b>
 * ({@code event: message} / {@code data: {…}}). Sessions via l'en-tête {@code mcp-session-id}.
 * Auth par pass-through : un {@code token} éventuel est relayé en {@code Authorization: Bearer}, ou tel quel
 * dans l'en-tête choisi pour le serveur ({@code authHeader}, ex. {@code X-API-Key}).
 */
@Component
@Slf4j
public class McpClient {

    private final HttpClient http;
    private final ObjectMapper objectMapper;
    private final Duration readTimeout;
    private final boolean allowPrivateNetwork;

    public McpClient(ObjectMapper objectMapper,
                     @Value("${integrations.mcp.connect-timeout-ms:10000}") long connectTimeoutMs,
                     @Value("${integrations.mcp.read-timeout-ms:60000}") long readTimeoutMs,
                     @Value("${integrations.mcp.allow-private-network:false}") boolean allowPrivateNetwork) {
        this.objectMapper = objectMapper;
        this.readTimeout = Duration.ofMillis(readTimeoutMs);
        this.allowPrivateNetwork = allowPrivateNetwork;
        this.http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(connectTimeoutMs))
            .build();
    }

    /**
     * Référence d'un serveur MCP externe connecté sur un workspace (issue de {@code connector_connection}).
     * {@code authHeader} : en-tête qui porte le jeton tel quel ; {@code null} = {@code Authorization: Bearer}.
     */
    public record ServerRef(String connectorKey, String serverUrl, String token, String authHeader) {
        public ServerRef(String connectorKey, String serverUrl, String token) {
            this(connectorKey, serverUrl, token, null);
        }
    }

    /**
     * Définition d'un outil distant ({@code tools/list}). {@code readOnly} est dérivé de
     * {@code annotations.readOnlyHint} — <b>par défaut faux</b> (traité comme écriture → confirmation
     * requise) si l'indice est absent, choix conservateur pour la sûreté.
     */
    public record ToolDef(String name, String description, JsonNode inputSchema, boolean readOnly) {}

    /**
     * Session MCP ouverte : URL + token de pass-through + {@code mcp-session-id} <b>optionnel</b>
     * ({@code null} pour un serveur stateless qui n'en émet pas — l'en-tête n'est alors pas renvoyé).
     */
    public record Session(String baseUrl, String sessionId, String token, String authHeader) {
        public Session(String baseUrl, String sessionId, String token) {
            this(baseUrl, sessionId, token, null);
        }
    }

    // -------------------------------------------------------------------------

    /**
     * Ouvre une session : {@code initialize} (capture du {@code mcp-session-id}) puis notification
     * {@code notifications/initialized}. Lève {@link BusinessException} si le serveur est injoignable.
     */
    public Session initialize(ServerRef ref) {
        ObjectNode params = objectMapper.createObjectNode();
        params.put("protocolVersion", "2025-06-18");
        params.set("capabilities", objectMapper.createObjectNode());
        ObjectNode clientInfo = objectMapper.createObjectNode();
        clientInfo.put("name", "taskforce-mcp-client");
        clientInfo.put("version", "0.1.0");
        params.set("clientInfo", clientInfo);

        HttpResponse<String> res = send(ref.serverUrl(), ref.token(), ref.authHeader(), null,
            rpcBody("initialize", params, 1));
        // Un statut d'erreur (ex. 401 token invalide) doit remonter clairement, plutôt que de se
        // déguiser en « serveur sans session ».
        if (res.statusCode() / 100 != 2) {
            throw new BusinessException("MCP handshake refused (" + ref.connectorKey()
                + ", HTTP " + res.statusCode() + ")");
        }
        // Vérifie qu'initialize a renvoyé un résultat JSON-RPC exploitable (sinon protocole KO).
        parseResult(res, "initialize");
        // mcp-session-id est OPTIONNEL (transport Streamable HTTP) : un serveur stateless (ex. Linear)
        // n'en renvoie pas. On le capture s'il est présent (à réémettre sur les appels suivants),
        // sinon session sans id — send() n'ajoute l'en-tête que s'il est non nul, donc le mode
        // stateless fonctionne de bout en bout (tools/list, tools/call, close).
        String sessionId = res.headers().firstValue("mcp-session-id").orElse(null);

        Session session = new Session(ref.serverUrl(), sessionId, ref.token(), ref.authHeader());
        // Notification obligatoire (pas d'id, pas de réponse attendue) — best-effort.
        try {
            send(session.baseUrl(), session.token(), session.authHeader(), session.sessionId(),
                "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}");
        } catch (Exception e) {
            log.debug("notifications/initialized ignorée ({}) : {}", ref.connectorKey(), e.getMessage());
        }
        return session;
    }

    /** Liste les outils exposés par le serveur ({@code tools/list}). */
    public List<ToolDef> listTools(Session session) {
        JsonNode result = parseResult(
            send(session.baseUrl(), session.token(), session.authHeader(), session.sessionId(),
                rpcBody("tools/list", null, 2)),
            "tools/list");
        List<ToolDef> out = new ArrayList<>();
        for (JsonNode t : result.path("tools")) {
            String name = t.path("name").asText(null);
            if (name == null || name.isBlank()) continue;
            boolean readOnly = t.path("annotations").path("readOnlyHint").asBoolean(false);
            out.add(new ToolDef(name, t.path("description").asText(""), t.get("inputSchema"), readOnly));
        }
        return out;
    }

    /**
     * Appelle un outil distant ({@code tools/call}) et renvoie son contenu texte agrégé. Un résultat
     * marqué {@code isError} est renvoyé préfixé (l'agent le remonte comme échec d'outil).
     */
    public String callTool(Session session, String toolName, Map<String, Object> args) {
        ObjectNode params = objectMapper.createObjectNode();
        params.put("name", toolName);
        params.set("arguments", objectMapper.valueToTree(args != null ? args : Map.of()));

        JsonNode result = parseResult(
            send(session.baseUrl(), session.token(), session.authHeader(), session.sessionId(),
                rpcBody("tools/call", params, 3)),
            "tools/call " + toolName);

        StringBuilder sb = new StringBuilder();
        for (JsonNode block : result.path("content")) {
            if ("text".equals(block.path("type").asText())) {
                if (sb.length() > 0) sb.append('\n');
                sb.append(block.path("text").asText(""));
            }
        }
        String text = sb.length() > 0 ? sb.toString() : result.toString();
        return result.path("isError").asBoolean(false) ? "[tool error] " + text : text;
    }

    /** Ferme la session côté serveur ({@code DELETE}) — best-effort. */
    public void close(Session session) {
        if (session == null || session.sessionId() == null) return;
        try {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(session.baseUrl()))
                .timeout(readTimeout)
                .header("mcp-session-id", session.sessionId())
                .DELETE();
            authorize(b, session.token(), session.authHeader());
            http.send(b.build(), HttpResponse.BodyHandlers.discarding());
        } catch (Exception e) {
            log.debug("Fermeture session MCP ignorée : {}", e.getMessage());
        }
    }

    // -------------------------------------------------------------------------

    private String rpcBody(String method, JsonNode params, int id) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("jsonrpc", "2.0");
        root.put("id", id);
        root.put("method", method);
        if (params != null) root.set("params", params);
        return root.toString();
    }

    /**
     * Refuse une URL de serveur MCP qui vise le réseau interne du serveur (garde anti-SSRF, OSS-1.2) :
     * bouclage, adresses privées, métadonnées cloud, réseau Tailscale, noms de service Docker. Appelée à
     * l'enregistrement (refus immédiat) et avant chaque requête (URL corrompue en base, rebinding DNS).
     * Une instance on-premise qui veut joindre ses propres serveurs MCP internes l'ouvre en connaissance
     * de cause : {@code integrations.mcp.allow-private-network=true}.
     */
    public void assertAllowed(String url) {
        if (allowPrivateNetwork) return;
        try {
            SsrfGuard.assertPublicHttpUrl(url);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException("MCP server refused: " + ex.getMessage());
        }
    }

    private HttpResponse<String> send(String url, String token, String authHeader, String sessionId, String body) {
        assertAllowed(url);
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url))
            .timeout(readTimeout)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        authorize(b, token, authHeader);
        if (sessionId != null) b.header("mcp-session-id", sessionId);
        try {
            return http.send(b.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (Exception ex) {
            throw new BusinessException("Unreachable MCP server (" + url + "): " + ex.getMessage());
        }
    }

    /** Extrait le nœud {@code result} d'une réponse JSON-RPC (corps SSE ou JSON), sinon lève l'erreur. */
    private JsonNode parseResult(HttpResponse<String> res, String context) {
        String json = extractJson(res.body());
        JsonNode root;
        try {
            root = objectMapper.readTree(json);
        } catch (Exception ex) {
            throw new BusinessException("Unreadable MCP response (" + context + ", HTTP " + res.statusCode() + ")");
        }
        if (root.has("error") && !root.path("error").isNull()) {
            throw new BusinessException("MCP error (" + context + "): " + root.path("error").path("message").asText());
        }
        return root.path("result");
    }

    /** Corps SSE → concatène les lignes {@code data:} ; corps déjà JSON → renvoyé tel quel. */
    static String extractJson(String body) {
        if (body == null) return "{}";
        String trimmed = body.stripLeading();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) return body;
        StringBuilder sb = new StringBuilder();
        for (String line : body.split("\n")) {
            String l = line.strip();
            if (l.startsWith("data:")) sb.append(l.substring(5).strip());
        }
        return sb.length() > 0 ? sb.toString() : (body.isBlank() ? "{}" : body);
    }

    /** Jeton relayé tel quel dans l'en-tête choisi pour le serveur, sinon en {@code Authorization: Bearer}. */
    private static void authorize(HttpRequest.Builder b, String token, String authHeader) {
        if (!hasToken(token)) return;
        if (authHeader != null && !authHeader.isBlank()) b.header(authHeader, token);
        else b.header("Authorization", "Bearer " + token);
    }

    private static boolean hasToken(String token) {
        return token != null && !token.isBlank();
    }
}
