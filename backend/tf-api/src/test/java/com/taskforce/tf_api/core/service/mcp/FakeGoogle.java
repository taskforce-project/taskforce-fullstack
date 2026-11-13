package com.taskforce.tf_api.core.service.mcp;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * Un faux Google sur 127.0.0.1, pour les essais de contrat des fichiers de l'entreprise (TF-J2-14) : son serveur
 * d'autorisation (metadata OpenID, échange du code avec PKCE S256, refus du paramètre {@code resource}, révocation) et
 * l'API de Drive v3 que TaskForce appelle (chercher, décrire, exporter un document, envoyer un fichier en
 * {@code multipart/related}), qui n'accepte que le jeton qu'il a donné. Les fichiers sont ceux de {@code drive.file} :
 * ceux qu'on lui ajoute (le sélecteur) et ceux qu'on lui envoie.
 */
public class FakeGoogle implements AutoCloseable {

    public static final String CLIENT_ID = "google-client.apps.example";
    public static final String CLIENT_SECRET = "google-secret";
    public static final String ACCESS = "google-access-1";

    private final HttpServer server;
    private final ObjectMapper om = new ObjectMapper();
    private final Map<String, String[]> codes = new ConcurrentHashMap<>();
    private final Map<String, ObjectNode> files = new ConcurrentHashMap<>();
    private final Map<String, String> contents = new ConcurrentHashMap<>();
    private final AtomicInteger ids = new AtomicInteger(1);
    /** Ce que l'échange du code a reçu, pour vérifier PKCE et l'absence de resource. */
    public final List<Map<String, String>> tokenRequests = new ArrayList<>();
    public final List<String> revoked = new ArrayList<>();

    public FakeGoogle() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/.well-known/openid-configuration", this::metadata);
        server.createContext("/token", this::token);
        server.createContext("/revoke", ex -> {
            revoked.add(form(ex).get("token"));
            send(ex, 200, "{}");
        });
        server.createContext("/drive/v3/files", this::drive);
        server.createContext("/upload/drive/v3/files", this::upload);
        server.start();
    }

    public String base() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    /** Un fichier que la personne a choisi dans le sélecteur : TaskForce peut le lire. */
    public String addDoc(String name, String text, String owner, String version) {
        String id = "doc" + ids.getAndIncrement();
        ObjectNode f = om.createObjectNode().put("id", id).put("name", name)
            .put("mimeType", "application/vnd.google-apps.document").put("modifiedTime", "2026-11-10T14:02:11.000Z")
            .put("version", version).put("webViewLink", "https://docs.example/" + id);
        f.putArray("owners").addObject().put("displayName", owner);
        f.putObject("lastModifyingUser").put("displayName", owner);
        files.put(id, f);
        contents.put(id, text);
        return id;
    }

    /** Un dossier choisi dans le sélecteur, où la personne peut ajouter des fichiers. */
    public String addFolder(String name, boolean canAdd) {
        String id = "folder" + ids.getAndIncrement();
        ObjectNode f = om.createObjectNode().put("id", id).put("name", name)
            .put("mimeType", "application/vnd.google-apps.folder").put("webViewLink", "https://drive.example/" + id);
        f.putObject("capabilities").put("canAddChildren", canAdd);
        files.put(id, f);
        return id;
    }

    /** Les fichiers envoyés dans un dossier, avec leur contenu. */
    public Map<String, String> uploadedIn(String folderId) {
        Map<String, String> out = new LinkedHashMap<>();
        files.values().stream().filter(f -> folderId.equals(f.path("parents").path(0).asText(null)))
            .forEach(f -> out.put(f.path("name").asText(), contents.get(f.path("id").asText())));
        return out;
    }

    /** La personne accepte chez Google : le code revient avec le state, sur l'adresse de retour. */
    public Map<String, String> approve(String authorizeUrl) {
        Map<String, String> q = query(URI.create(authorizeUrl).getRawQuery());
        String code = "code-" + ids.getAndIncrement();
        codes.put(code, new String[] { q.get("code_challenge"), q.get("redirect_uri"), q.get("client_id") });
        Map<String, String> back = new LinkedHashMap<>();
        back.put("code", code);
        back.put("state", q.get("state"));
        return back;
    }

    /** L'adresse d'autorisation, lue comme Google la lit. */
    public static Map<String, String> query(String raw) {
        Map<String, String> out = new LinkedHashMap<>();
        if (raw == null) return out;
        for (String pair : raw.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0) out.put(URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
        }
        return out;
    }

    @Override
    public void close() {
        server.stop(0);
    }

    // -------------------------------------------------------------------------

    private void metadata(HttpExchange ex) throws IOException {
        ObjectNode m = om.createObjectNode().put("issuer", base())
            .put("authorization_endpoint", base() + "/o/oauth2/v2/auth").put("token_endpoint", base() + "/token")
            .put("revocation_endpoint", base() + "/revoke");
        m.putArray("code_challenge_methods_supported").add("plain").add("S256");
        send(ex, 200, m.toString());
    }

    private void token(HttpExchange ex) throws IOException {
        Map<String, String> f = form(ex);
        synchronized (tokenRequests) {
            tokenRequests.add(f);
        }
        if (f.containsKey("resource")) {
            send(ex, 400, "{\"error\":\"invalid_request\",\"error_description\":\"Parameter not allowed: resource\"}");
            return;
        }
        if ("refresh_token".equals(f.get("grant_type"))) {
            send(ex, 200, "{\"access_token\":\"" + ACCESS + "\",\"expires_in\":3600}");
            return;
        }
        String[] grant = codes.remove(f.get("code"));
        if (grant == null || !grant[0].equals(s256(f.get("code_verifier"))) || !CLIENT_SECRET.equals(f.get("client_secret"))) {
            send(ex, 400, "{\"error\":\"invalid_grant\"}");
            return;
        }
        String claims = Base64.getUrlEncoder().withoutPadding()
            .encodeToString("{\"email\":\"ada@acme.example\"}".getBytes(StandardCharsets.UTF_8));
        send(ex, 200, "{\"access_token\":\"" + ACCESS + "\",\"refresh_token\":\"google-refresh\",\"expires_in\":3600,"
            + "\"scope\":\"openid email https://www.googleapis.com/auth/drive.file\",\"id_token\":\"h." + claims + ".s\"}");
    }

    private void drive(HttpExchange ex) throws IOException {
        if (!authorized(ex)) return;
        String path = ex.getRequestURI().getPath();
        Map<String, String> q = query(ex.getRequestURI().getRawQuery());
        if (path.equals("/drive/v3/files")) {
            ArrayNode list = om.createArrayNode();
            String word = word(q.getOrDefault("q", ""));
            files.values().stream().filter(f -> !"application/vnd.google-apps.folder".equals(f.path("mimeType").asText()))
                .filter(f -> word == null || f.path("name").asText().contains(word)
                    || contents.getOrDefault(f.path("id").asText(), "").contains(word))
                .forEach(list::add);
            ObjectNode out = om.createObjectNode();
            out.set("files", list);
            send(ex, 200, out.toString());
            return;
        }
        String rest = path.substring("/drive/v3/files/".length());
        if (rest.endsWith("/export")) {
            String id = rest.substring(0, rest.length() - "/export".length());
            String text = contents.get(id);
            if (text == null) send(ex, 404, "{\"error\":{\"message\":\"File not found\"}}");
            else send(ex, 200, text);
            return;
        }
        ObjectNode f = files.get(rest);
        if (f == null) send(ex, 404, "{\"error\":{\"message\":\"File not found: " + rest + "\"}}");
        else send(ex, 200, f.toString());
    }

    private void upload(HttpExchange ex) throws IOException {
        if (!authorized(ex)) return;
        String type = ex.getRequestHeaders().getFirst("Content-Type");
        String boundary = type.substring(type.indexOf("boundary=") + "boundary=".length());
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String[] parts = body.split("--" + boundary);
        JsonNode meta = om.readTree(parts[1].substring(parts[1].indexOf("\r\n\r\n") + 4).strip());
        String content = parts[2].substring(parts[2].indexOf("\r\n\r\n") + 4);
        content = content.substring(0, content.length() - 2);
        String parent = meta.path("parents").path(0).asText();
        if (!files.containsKey(parent)) {
            send(ex, 404, "{\"error\":{\"message\":\"File not found: " + parent + "\"}}");
            return;
        }
        String id = "up" + ids.getAndIncrement();
        ObjectNode f = om.createObjectNode().put("id", id).put("name", meta.path("name").asText())
            .put("mimeType", meta.path("mimeType").asText()).put("version", "1")
            .put("webViewLink", "https://drive.example/file/" + id).put("modifiedTime", "2026-11-12T10:00:00.000Z");
        f.putArray("parents").add(parent);
        files.put(id, f);
        contents.put(id, content);
        send(ex, 200, f.toString());
    }

    private boolean authorized(HttpExchange ex) throws IOException {
        if (!("Bearer " + ACCESS).equals(ex.getRequestHeaders().getFirst("Authorization"))) {
            send(ex, 401, "{\"error\":{\"message\":\"Invalid Credentials\"}}");
            return false;
        }
        return true;
    }

    /** Le mot cherché dans le texte (« fullText contains '...' ») ; nul quand rien n'est cherché. */
    private static String word(String q) {
        int at = q.indexOf("fullText contains '");
        if (at < 0) return null;
        String rest = q.substring(at + "fullText contains '".length());
        return rest.substring(0, rest.indexOf('\''));
    }

    private Map<String, String> form(HttpExchange ex) throws IOException {
        return query(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
    }

    private static String s256(String verifier) {
        try {
            return Base64.getUrlEncoder().withoutPadding().encodeToString(
                MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
        } catch (Exception e) {
            return "";
        }
    }

    private static void send(HttpExchange ex, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(status, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }
}
