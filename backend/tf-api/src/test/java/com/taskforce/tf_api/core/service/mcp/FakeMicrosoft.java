package com.taskforce.tf_api.core.service.mcp;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
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
 * Un faux Microsoft sur 127.0.0.1 (TF-J2-14) : un serveur d'autorisation qui échange le code avec PKCE S256 et refuse
 * {@code resource} (comme Entra v2), qui peut répondre que l'administrateur doit d'abord accorder (AADSTS90094), et la part
 * de Microsoft Graph que TaskForce appelle : OneDrive et une bibliothèque SharePoint (les dossiers, un fichier, ses
 * versions, son contenu par un lien présigné, l'envoi), la recherche, et Teams (équipes, canaux, conversations, messages).
 * Les particularités d'Entra lui-même (S256 qu'il n'annonce pas, l'émetteur {@code {tenantid}}) se jouent dans
 * {@code McpOAuthDiscoveryTest}, contre ses vraies métadonnées : elles ne valent que pour son hôte.
 */
public class FakeMicrosoft implements AutoCloseable {

    public static final String CLIENT_ID = "ms-client-id";
    public static final String CLIENT_SECRET = "ms-secret";
    public static final String ACCESS = "ms-access-1";
    public static final String READ_SCOPES = "openid profile email offline_access User.Read Files.Read.All Sites.Read.All "
        + "Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Read.All Chat.Read";

    private final HttpServer server;
    private final ObjectMapper om = new ObjectMapper();
    private final Map<String, String[]> codes = new ConcurrentHashMap<>();
    private final Map<String, ObjectNode> items = new ConcurrentHashMap<>();
    private final Map<String, String> contents = new ConcurrentHashMap<>();
    private final AtomicInteger ids = new AtomicInteger(1);
    public final List<Map<String, String>> tokenRequests = new ArrayList<>();
    /** Les messages postés dans Teams : le canal ou la conversation, puis le texte. */
    public final List<String> posted = new ArrayList<>();

    public FakeMicrosoft() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", this::route);
        server.start();
        folder("drive-me", "root", null, "OneDrive");
        folder("drive-sp", "root", null, "Documents");
    }

    public String base() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    /** Un dossier d'un lecteur. */
    public String folder(String driveId, String id, String parent, String name) {
        ObjectNode f = om.createObjectNode().put("id", id).put("name", name).put("webUrl", "https://sharepoint.example/" + id);
        f.putObject("folder").put("childCount", 0);
        ObjectNode ref = f.putObject("parentReference").put("driveId", driveId);
        if (parent != null) ref.put("id", parent);
        items.put(driveId + "/" + id, f);
        return id;
    }

    /** Un document Word ou un texte, rangé par quelqu'un de l'entreprise. */
    public String file(String driveId, String parent, String name, String mime, byte[] content, String owner) {
        String id = "item" + ids.getAndIncrement();
        ObjectNode f = om.createObjectNode().put("id", id).put("name", name).put("webUrl", "https://sharepoint.example/" + id)
            .put("lastModifiedDateTime", "2026-11-09T08:30:00Z").put("size", content.length);
        f.putObject("file").put("mimeType", mime);
        f.putObject("parentReference").put("driveId", driveId).put("id", parent);
        f.putObject("createdBy").putObject("user").put("displayName", owner);
        f.putObject("lastModifiedBy").putObject("user").put("displayName", owner);
        items.put(driveId + "/" + id, f);
        contents.put(id, new String(content, StandardCharsets.ISO_8859_1));
        return id;
    }

    /** Les fichiers envoyés dans un dossier, avec leur contenu. */
    public Map<String, String> uploadedIn(String driveId, String folderId) {
        Map<String, String> out = new LinkedHashMap<>();
        items.forEach((key, f) -> {
            if (key.startsWith(driveId + "/") && folderId.equals(f.path("parentReference").path("id").asText(null))
                    && f.path("uploaded").asBoolean(false)) {
                out.put(f.path("name").asText(), contents.get(f.path("id").asText()));
            }
        });
        return out;
    }

    /** La personne accepte chez Microsoft ; {@code adminFirst} : sa politique demande l'administrateur. */
    public Map<String, String> approve(String authorizeUrl, boolean adminFirst) {
        Map<String, String> q = FakeGoogle.query(URI.create(authorizeUrl).getRawQuery());
        Map<String, String> back = new LinkedHashMap<>();
        back.put("state", q.get("state"));
        if (adminFirst) {
            back.put("error", "access_denied");
            back.put("error_description", "AADSTS90094: The grant requires admin permission.");
            return back;
        }
        String code = "code-" + ids.getAndIncrement();
        codes.put(code, new String[] { q.get("code_challenge"), q.get("scope") });
        back.put("code", code);
        return back;
    }

    @Override
    public void close() {
        server.stop(0);
    }

    // -------------------------------------------------------------------------

    private void route(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        String method = ex.getRequestMethod();
        if (path.equals("/.well-known/openid-configuration")) {
            ObjectNode m = om.createObjectNode().put("issuer", base())
                .put("authorization_endpoint", base() + "/oauth2/v2.0/authorize").put("token_endpoint", base() + "/token");
            m.putArray("code_challenge_methods_supported").add("S256");
            send(ex, 200, m.toString());
            return;
        }
        if (path.equals("/token")) {
            token(ex);
            return;
        }
        if (path.startsWith("/download/")) {
            send(ex, 200, contents.getOrDefault(path.substring("/download/".length()), ""), "application/octet-stream");
            return;
        }
        if (!("Bearer " + ACCESS).equals(ex.getRequestHeaders().getFirst("Authorization"))) {
            send(ex, 401, "{\"error\":{\"code\":\"InvalidAuthenticationToken\",\"message\":\"Access token is empty.\"}}");
            return;
        }
        if (path.equals("/me/drive")) {
            send(ex, 200, "{\"id\":\"drive-me\",\"name\":\"OneDrive\"}");
        } else if (path.equals("/me/followedSites")) {
            send(ex, 200, "{\"value\":[{\"id\":\"contoso.sharepoint.com,1,2\",\"displayName\":\"Finance\"}]}");
        } else if (path.equals("/sites/contoso.sharepoint.com,1,2/drives")) {
            send(ex, 200, "{\"value\":[{\"id\":\"drive-sp\",\"name\":\"Documents\"}]}");
        } else if (path.equals("/search/query") && "POST".equals(method)) {
            search(ex);
        } else if (path.startsWith("/drives/")) {
            drives(ex, path.substring("/drives/".length()), method);
        } else if (path.equals("/me/joinedTeams")) {
            send(ex, 200, "{\"value\":[{\"id\":\"team-1\",\"displayName\":\"Product\"}]}");
        } else if (path.equals("/teams/team-1/channels")) {
            send(ex, 200, "{\"value\":[{\"id\":\"19:general@thread.tacv2\",\"displayName\":\"General\"}]}");
        } else if (path.equals("/teams/team-1/channels/19:general@thread.tacv2/messages")) {
            if ("POST".equals(method)) {
                JsonNode body = om.readTree(ex.getRequestBody().readAllBytes());
                posted.add("channel General: " + body.path("body").path("content").asText());
                send(ex, 201, "{\"id\":\"m9\",\"createdDateTime\":\"2026-11-12T10:00:00Z\",\"body\":{\"content\":\"ok\"},"
                    + "\"from\":{\"user\":{\"displayName\":\"Ada\"}},\"webUrl\":\"https://teams.example/m9\"}");
            } else {
                send(ex, 200, "{\"value\":[{\"id\":\"m1\",\"messageType\":\"message\",\"createdDateTime\":"
                    + "\"2026-11-10T09:15:00Z\",\"from\":{\"user\":{\"displayName\":\"Grace Hopper\"}},"
                    + "\"body\":{\"contentType\":\"html\",\"content\":\"<p>Ship the <b>Q4</b> plan &amp; tell finance</p>\"},"
                    + "\"webUrl\":\"https://teams.example/m1\"},{\"id\":\"s1\",\"messageType\":\"systemEventMessage\"}]}");
            }
        } else if (path.equals("/me/chats")) {
            send(ex, 200, "{\"value\":[{\"id\":\"19:chat@unq.gbl.spaces\",\"topic\":null,\"members\":["
                + "{\"displayName\":\"Ada\"},{\"displayName\":\"Grace Hopper\"}]}]}");
        } else if (path.equals("/chats/19:chat@unq.gbl.spaces/messages")) {
            if ("POST".equals(method)) {
                JsonNode body = om.readTree(ex.getRequestBody().readAllBytes());
                posted.add("chat: " + body.path("body").path("content").asText());
                send(ex, 201, "{\"id\":\"c9\",\"body\":{\"content\":\"ok\"},\"from\":{\"user\":{\"displayName\":\"Ada\"}}}");
            } else {
                send(ex, 200, "{\"value\":[{\"id\":\"c1\",\"messageType\":\"message\",\"createdDateTime\":"
                    + "\"2026-11-11T16:40:00Z\",\"from\":{\"user\":{\"displayName\":\"Grace Hopper\"}},"
                    + "\"body\":{\"contentType\":\"text\",\"content\":\"Budget is due Friday\"}}]}");
            }
        } else {
            send(ex, 404, "{\"error\":{\"code\":\"itemNotFound\",\"message\":\"Not found: " + path + "\"}}");
        }
    }

    private void drives(HttpExchange ex, String rest, String method) throws IOException {
        // {driveId}/items/{itemId}[/children|/versions|/content] ou {driveId}/items/{folderId}:/{name}:/content
        String[] head = rest.split("/items/", 2);
        String driveId = head[0];
        String tail = head.length > 1 ? head[1] : "";
        if ("PUT".equals(method) && tail.contains(":/")) {
            upload(ex, driveId, tail);
            return;
        }
        String itemId = tail.contains("/") ? tail.substring(0, tail.indexOf('/')) : tail;
        String sub = tail.contains("/") ? tail.substring(tail.indexOf('/') + 1) : "";
        ObjectNode item = items.get(driveId + "/" + itemId);
        if (item == null) {
            send(ex, 404, "{\"error\":{\"code\":\"itemNotFound\",\"message\":\"The resource could not be found.\"}}");
            return;
        }
        switch (sub) {
            case "children" -> {
                ArrayNode list = om.createArrayNode();
                items.forEach((key, f) -> {
                    if (key.startsWith(driveId + "/") && itemId.equals(f.path("parentReference").path("id").asText(null))) {
                        list.add(f);
                    }
                });
                ObjectNode out = om.createObjectNode();
                out.set("value", list);
                send(ex, 200, out.toString());
            }
            case "versions" -> send(ex, 200, "{\"value\":[{\"id\":\"1.0\"},{\"id\":\"" + item.path("version").asText("2.0")
                + "\"}]}");
            case "content" -> {
                ex.getResponseHeaders().add("Location", base() + "/download/" + itemId);
                ex.sendResponseHeaders(302, -1);
                ex.close();
            }
            default -> send(ex, 200, item.toString());
        }
    }

    private void upload(HttpExchange ex, String driveId, String tail) throws IOException {
        String folderId = tail.substring(0, tail.indexOf(":/"));
        String name = tail.substring(tail.indexOf(":/") + 2, tail.lastIndexOf(":/"));
        if (!items.containsKey(driveId + "/" + folderId)) {
            send(ex, 404, "{\"error\":{\"code\":\"itemNotFound\",\"message\":\"The resource could not be found.\"}}");
            return;
        }
        String chosen = name;
        for (int n = 1; taken(driveId, folderId, chosen); n++) chosen = name.replace(".md", " " + n + ".md");
        String id = "up" + ids.getAndIncrement();
        ObjectNode f = om.createObjectNode().put("id", id).put("name", chosen).put("webUrl", "https://sharepoint.example/" + id)
            .put("lastModifiedDateTime", "2026-11-12T10:00:00Z").put("uploaded", true).put("version", "1.0");
        f.putObject("file").put("mimeType", ex.getRequestHeaders().getFirst("Content-Type"));
        f.putObject("parentReference").put("driveId", driveId).put("id", folderId);
        items.put(driveId + "/" + id, f);
        contents.put(id, new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        send(ex, 201, f.toString());
    }

    private boolean taken(String driveId, String folderId, String name) {
        return items.entrySet().stream().anyMatch(e -> e.getKey().startsWith(driveId + "/")
            && folderId.equals(e.getValue().path("parentReference").path("id").asText(null))
            && name.equals(e.getValue().path("name").asText()));
    }

    private void search(HttpExchange ex) throws IOException {
        String text = om.readTree(ex.getRequestBody().readAllBytes()).path("requests").path(0).path("query")
            .path("queryString").asText();
        ArrayNode hits = om.createArrayNode();
        items.forEach((key, f) -> {
            if (f.has("file") && (f.path("name").asText().contains(text) || contents.getOrDefault(f.path("id").asText(), "")
                    .contains(text))) {
                hits.addObject().set("resource", f);
            }
        });
        ObjectNode out = om.createObjectNode();
        out.putArray("value").addObject().putArray("hitsContainers").addObject().set("hits", hits);
        send(ex, 200, out.toString());
    }

    private void token(HttpExchange ex) throws IOException {
        Map<String, String> f = FakeGoogle.query(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        synchronized (tokenRequests) {
            tokenRequests.add(f);
        }
        if (f.containsKey("resource")) {
            send(ex, 400, "{\"error\":\"invalid_request\",\"error_description\":\"AADSTS901002: The 'resource' request "
                + "parameter is not supported.\"}");
            return;
        }
        String[] grant = codes.remove(f.get("code"));
        if (grant == null || !grant[0].equals(s256(f.get("code_verifier"))) || !CLIENT_SECRET.equals(f.get("client_secret"))) {
            send(ex, 400, "{\"error\":\"invalid_grant\"}");
            return;
        }
        String claims = Base64.getUrlEncoder().withoutPadding()
            .encodeToString("{\"preferred_username\":\"ada@contoso.example\"}".getBytes(StandardCharsets.UTF_8));
        send(ex, 200, "{\"access_token\":\"" + ACCESS + "\",\"refresh_token\":\"ms-refresh\",\"expires_in\":3600,"
            + "\"scope\":\"" + grant[1] + "\",\"id_token\":\"h." + claims + ".s\"}");
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
        send(ex, status, body, "application/json");
    }

    private static void send(HttpExchange ex, int status, String body, String type) throws IOException {
        byte[] bytes = "application/octet-stream".equals(type) ? body.getBytes(StandardCharsets.ISO_8859_1)
            : body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", type);
        ex.sendResponseHeaders(status, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }
}
