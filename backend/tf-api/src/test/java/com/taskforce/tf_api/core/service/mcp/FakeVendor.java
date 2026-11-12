package com.taskforce.tf_api.core.service.mcp;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * Un éditeur factice pour les essais de contrat (séance n°22, R154 et R158) : un serveur MCP et son serveur
 * d'autorisation sur 127.0.0.1, sans réseau ni compte réel. Il suit la norme MCP du 28/07/2026 et les RFC qu'elle cite :
 * 401 avec {@code WWW-Authenticate} (RFC 9728), métadonnées du serveur d'autorisation (RFC 8414), inscription dynamique
 * (RFC 7591), document de métadonnées client (CIMD), PKCE S256 vérifié (RFC 7636), {@code iss} au retour (RFC 9207),
 * rotation des jetons de renouvellement, révocation (RFC 7009). Il garde tout ce qu'il reçoit, pour que l'essai le
 * vérifie : rien ne passe par un autre chemin que celui que la norme décrit.
 */
public class FakeVendor implements AutoCloseable {

    private final HttpServer server;
    private final ObjectMapper json = new ObjectMapper();
    private final String base;

    /** Les options du serveur d'autorisation. */
    public volatile boolean dcr = true;
    public volatile boolean cimd = false;
    public volatile boolean revocation = true;
    public volatile long expiresIn = 3600;
    /** Les clients enregistrés d'avance chez l'éditeur : identifiant et secret. */
    public final Map<String, String> preRegistered = new ConcurrentHashMap<>();

    /** Ce que l'éditeur a reçu. */
    public final List<JsonNode> registrations = new CopyOnWriteArrayList<>();
    public final List<Map<String, String>> tokenRequests = new CopyOnWriteArrayList<>();
    public final List<Map<String, String>> revoked = new CopyOnWriteArrayList<>();
    public final List<String> calls = new CopyOnWriteArrayList<>();
    public final List<String> authorizedTokens = new CopyOnWriteArrayList<>();
    /** Les jetons qui ont fait chaque appel d'outil, dans l'ordre. */
    public final List<String> callTokens = new CopyOnWriteArrayList<>();

    /** Les outils que le serveur MCP liste, tels qu'il les décrit (son texte, son schéma, ses indices). */
    public final List<ObjectNode> tools = new CopyOnWriteArrayList<>();
    /** Ce que rend chaque outil appelé, par son nom. */
    public final Map<String, String> outputs = new ConcurrentHashMap<>();

    private final Map<String, Grant> codes = new ConcurrentHashMap<>();
    private final Set<String> accessTokens = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private final Map<String, String> refreshTokens = new ConcurrentHashMap<>(); // jeton -> client
    private final Set<String> dcrClients = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private final AtomicInteger seq = new AtomicInteger();

    private record Grant(String clientId, String redirectUri, String challenge, String resource) {}

    public FakeVendor() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        base = "http://127.0.0.1:" + server.getAddress().getPort();
        server.createContext("/", this::route);
        server.start();
        tool("list_issues", "Lists the issues of the workspace.", true);
        tool("save_comment", "Adds a comment to an issue.", false);
    }

    /** L'adresse du serveur MCP. */
    public String mcpUrl() {
        return base + "/mcp";
    }

    /** L'émetteur, qui est aussi l'origine du faux éditeur. */
    public String issuer() {
        return base;
    }

    /** L'adresse d'un document CIMD que ce faux sert lui-même (celui que publierait TaskForce). */
    public String cimdDocumentUrl() {
        return base + "/taskforce-client.json";
    }

    /** Ajoute (ou remplace) un outil, avec l'indice de lecture seule qu'il déclare de lui-même. */
    public void tool(String name, String description, boolean readOnlyHint) {
        tools.removeIf(t -> t.path("name").asText().equals(name));
        ObjectNode t = json.createObjectNode();
        t.put("name", name);
        t.put("description", description);
        t.set("inputSchema", json.createObjectNode().put("type", "object"));
        t.set("annotations", json.createObjectNode().put("readOnlyHint", readOnlyHint));
        tools.add(t);
    }

    /**
     * Ce que ferait le navigateur de la personne : il ouvre l'adresse d'autorisation, la personne accepte, et le
     * serveur d'autorisation le renvoie sur l'adresse de retour avec le code, le {@code state} et {@code iss}.
     * Renvoie les paramètres de ce retour.
     */
    public Map<String, String> approve(String authorizeUrl) {
        Map<String, String> q = query(URI.create(authorizeUrl).getRawQuery());
        String clientId = q.get("client_id");
        boolean known = dcrClients.contains(clientId) || preRegistered.containsKey(clientId)
            || (cimd && clientId != null && clientId.startsWith("http"));
        if (!known) throw new IllegalStateException("unknown client " + clientId);
        if (!"S256".equals(q.get("code_challenge_method"))) throw new IllegalStateException("PKCE S256 required");
        String code = "code-" + seq.incrementAndGet();
        codes.put(code, new Grant(clientId, q.get("redirect_uri"), q.get("code_challenge"), q.get("resource")));
        Map<String, String> back = new LinkedHashMap<>();
        back.put("code", code);
        back.put("state", q.get("state"));
        back.put("iss", base);
        back.put("redirect_uri", q.get("redirect_uri"));
        back.put("scope", q.get("scope"));
        return back;
    }

    /** Un jeton d'accès valable, pour un essai qui ne rejoue pas l'OAuth (l'essai d'attaque de R158). */
    public String issueToken() {
        return issue("test-client").path("access_token").asText();
    }

    /** Invalide tous les jetons d'accès : le prochain appel répond 401. */
    public void expireAccessTokens() {
        accessTokens.clear();
    }

    @Override
    public void close() {
        server.stop(0);
    }

    // -------------------------------------------------------------------------

    private void route(HttpExchange ex) throws IOException {
        try {
            String path = ex.getRequestURI().getPath();
            switch (path) {
                case "/mcp" -> mcp(ex);
                case "/.well-known/oauth-protected-resource/mcp" -> send(ex, 200, prm());
                case "/.well-known/oauth-authorization-server" -> send(ex, 200, asMetadata());
                case "/register" -> register(ex);
                case "/token" -> token(ex);
                case "/revoke" -> revoke(ex);
                case "/taskforce-client.json" -> send(ex, 200, cimdDocument());
                default -> send(ex, 404, json.createObjectNode());
            }
        } catch (RuntimeException e) {
            send(ex, 500, json.createObjectNode().put("error", e.getMessage()));
        }
    }

    private ObjectNode prm() {
        ObjectNode n = json.createObjectNode();
        n.put("resource", base + "/mcp");
        n.set("authorization_servers", json.createArrayNode().add(base));
        n.set("scopes_supported", json.createArrayNode().add("read").add("write").add("admin"));
        return n;
    }

    private ObjectNode asMetadata() {
        ObjectNode n = json.createObjectNode();
        n.put("issuer", base);
        n.put("authorization_endpoint", base + "/authorize");
        n.put("token_endpoint", base + "/token");
        if (dcr) n.put("registration_endpoint", base + "/register");
        if (revocation) n.put("revocation_endpoint", base + "/revoke");
        n.set("code_challenge_methods_supported", json.createArrayNode().add("S256"));
        n.put("client_id_metadata_document_supported", cimd);
        n.put("authorization_response_iss_parameter_supported", true);
        return n;
    }

    private ObjectNode cimdDocument() {
        ObjectNode n = json.createObjectNode();
        n.put("client_id", cimdDocumentUrl());
        n.put("client_name", "TaskForce");
        n.set("redirect_uris", json.createArrayNode().add("http://127.0.0.1:8080/api/mcp/oauth/callback")
            .add("http://127.0.0.1:47816/mcp/callback"));
        n.put("token_endpoint_auth_method", "none");
        return n;
    }

    private void register(HttpExchange ex) throws IOException {
        JsonNode body = json.readTree(ex.getRequestBody());
        registrations.add(body);
        String id = "dcr-" + seq.incrementAndGet();
        dcrClients.add(id);
        send(ex, 201, json.createObjectNode().put("client_id", id));
    }

    private void token(HttpExchange ex) throws IOException {
        Map<String, String> form = query(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        tokenRequests.add(form);
        String clientId = form.get("client_id");
        String secret = preRegistered.get(clientId);
        if (secret != null && !secret.equals(form.get("client_secret"))) {
            send(ex, 401, error("invalid_client"));
            return;
        }
        if ("authorization_code".equals(form.get("grant_type"))) {
            Grant grant = codes.remove(form.getOrDefault("code", ""));
            if (grant == null || !grant.clientId().equals(clientId) || !grant.redirectUri().equals(form.get("redirect_uri"))
                    || !s256(form.getOrDefault("code_verifier", "")).equals(grant.challenge())) {
                send(ex, 400, error("invalid_grant"));
                return;
            }
            send(ex, 200, issue(clientId));
        } else if ("refresh_token".equals(form.get("grant_type"))) {
            String refresh = form.getOrDefault("refresh_token", "");
            // Rotation : un jeton de renouvellement ne sert qu'une fois.
            if (refreshTokens.remove(refresh) == null) {
                send(ex, 400, error("invalid_grant"));
                return;
            }
            send(ex, 200, issue(clientId));
        } else {
            send(ex, 400, error("unsupported_grant_type"));
        }
    }

    private ObjectNode issue(String clientId) {
        String access = "at-" + seq.incrementAndGet();
        String refresh = "rt-" + seq.incrementAndGet();
        accessTokens.add(access);
        authorizedTokens.add(access);
        refreshTokens.put(refresh, clientId);
        ObjectNode n = json.createObjectNode();
        n.put("access_token", access);
        n.put("token_type", "Bearer");
        n.put("refresh_token", refresh);
        n.put("expires_in", expiresIn);
        n.put("email", "person-" + clientId + "@vendor.test");
        return n;
    }

    private void revoke(HttpExchange ex) throws IOException {
        Map<String, String> form = query(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        revoked.add(form);
        accessTokens.remove(form.get("token"));
        refreshTokens.remove(form.get("token"));
        ex.sendResponseHeaders(200, -1);
        ex.close();
    }

    private void mcp(HttpExchange ex) throws IOException {
        if ("DELETE".equals(ex.getRequestMethod())) {
            ex.sendResponseHeaders(200, -1);
            ex.close();
            return;
        }
        String auth = ex.getRequestHeaders().getFirst("Authorization");
        String token = auth != null && auth.startsWith("Bearer ") ? auth.substring(7) : null;
        if (token == null || !accessTokens.contains(token)) {
            ex.getResponseHeaders().set("WWW-Authenticate", "Bearer resource_metadata=\"" + base
                + "/.well-known/oauth-protected-resource/mcp\", scope=\"read\"");
            send(ex, 401, error("invalid_token"));
            return;
        }
        JsonNode rpc = json.readTree(ex.getRequestBody());
        String method = rpc.path("method").asText();
        if (method.startsWith("notifications/")) {
            ex.sendResponseHeaders(202, -1);
            ex.close();
            return;
        }
        ObjectNode result = json.createObjectNode();
        switch (method) {
            case "initialize" -> {
                result.put("protocolVersion", McpClient.PROTOCOL_VERSION);
                result.set("serverInfo", json.createObjectNode().put("name", "Fake vendor").put("version", "1"));
            }
            case "tools/list" -> {
                ArrayNode list = json.createArrayNode();
                tools.forEach(list::add);
                result.set("tools", list);
            }
            case "tools/call" -> {
                String name = rpc.path("params").path("name").asText();
                calls.add(name + " " + rpc.path("params").path("arguments"));
                callTokens.add(token);
                ArrayNode content = json.createArrayNode();
                content.add(json.createObjectNode().put("type", "text").put("text", outputs.getOrDefault(name, "ok " + name)));
                result.set("content", content);
            }
            default -> {
                send(ex, 200, json.createObjectNode().put("jsonrpc", "2.0").put("id", rpc.path("id").asInt())
                    .set("error", json.createObjectNode().put("code", -32601).put("message", "unknown " + method)));
                return;
            }
        }
        ObjectNode out = json.createObjectNode().put("jsonrpc", "2.0").put("id", rpc.path("id").asInt());
        out.set("result", result);
        send(ex, 200, out);
    }

    private ObjectNode error(String code) {
        return json.createObjectNode().put("error", code);
    }

    private void send(HttpExchange ex, int status, JsonNode body) throws IOException {
        byte[] bytes = json.writeValueAsBytes(body);
        ex.getResponseHeaders().set("Content-Type", "application/json");
        ex.sendResponseHeaders(status, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }

    static Map<String, String> query(String raw) {
        Map<String, String> out = new LinkedHashMap<>();
        if (raw == null || raw.isBlank()) return out;
        for (String pair : raw.split("&")) {
            int eq = pair.indexOf('=');
            if (eq <= 0) continue;
            out.put(URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
        }
        return out;
    }

    static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    private static String s256(String verifier) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(d);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Les noms des outils appelés, dans l'ordre. */
    public List<String> calledTools() {
        List<String> out = new ArrayList<>();
        for (String c : calls) out.add(c.split(" ", 2)[0]);
        return out;
    }
}
