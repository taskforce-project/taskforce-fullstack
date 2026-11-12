package com.taskforce.tf_api.core.service.mcp;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.taskforce.tf_api.shared.exception.BusinessException;

import lombok.RequiredArgsConstructor;

/**
 * Microsoft Graph (v1.0), avec les droits délégués de la personne (séance n°22, R154, R155) : OneDrive, les
 * bibliothèques SharePoint qu'elle peut lire, et Teams (les équipes, canaux et conversations où elle est). Pas Work IQ,
 * qui se paie en crédits Copilot. Chaque appel porte le jeton de la personne ; ce qu'elle ne peut pas lire chez
 * Microsoft, TaskForce ne le lit pas.
 */
@Component
@RequiredArgsConstructor
public class MicrosoftGraphApi {

    private static final Pattern ID = Pattern.compile("[A-Za-z0-9!_.,=:@-]{1,400}");
    private static final String ITEM = "id,name,folder,file,webUrl,lastModifiedDateTime,lastModifiedBy,createdBy,size,"
        + "eTag,parentReference";
    private static final int MESSAGES = 20;

    private final CompanyApiHttp http;

    /** Un fichier ou un dossier de OneDrive ou de SharePoint : de quoi le citer et l'ouvrir. */
    public record Item(String driveId, String id, String name, boolean folder, String mimeType, String webUrl,
                       String modified, String modifiedBy, String owner, Long size) {}

    /** Un endroit où choisir un dossier : le OneDrive de la personne, une bibliothèque SharePoint, un dossier. */
    public record Place(String driveId, String itemId, String name, String kind) {}

    /** Une équipe et ses canaux. */
    public record Team(String id, String name, List<Channel> channels) {}

    public record Channel(String id, String name) {}

    /** Une conversation de Teams : son sujet, ou ses membres. */
    public record Chat(String id, String name) {}

    /** Un message : qui, quand, le texte (sans le HTML), le lien. */
    public record Message(String id, String from, String at, String text, String webUrl) {}

    // --- Fichiers ----------------------------------------------------------

    /** Le OneDrive de la personne, puis les bibliothèques des sites SharePoint qu'elle suit. */
    public List<Place> roots(String base, String token) {
        List<Place> out = new ArrayList<>();
        JsonNode me = http.getJson(base + "/me/drive?$select=id,name", token);
        out.add(new Place(me.path("id").asText(), "root", me.path("name").asText("OneDrive"), "drive"));
        try {
            for (JsonNode site : http.getJson(base + "/me/followedSites?$select=id,displayName", token).path("value")) {
                String siteId = id(site.path("id").asText());
                for (JsonNode d : http.getJson(base + "/sites/" + siteId + "/drives?$select=id,name", token).path("value")) {
                    out.add(new Place(d.path("id").asText(), "root",
                        site.path("displayName").asText() + " · " + d.path("name").asText(), "library"));
                }
            }
        } catch (CompanyApiHttp.VendorError e) {
            // Un compte personnel n'a pas de SharePoint : son OneDrive seulement.
        }
        return out;
    }

    /** Les dossiers d'un dossier (ou de la racine d'un lecteur). */
    public List<Place> folders(String base, String token, String driveId, String itemId) {
        List<Place> out = new ArrayList<>();
        String url = base + "/drives/" + id(driveId) + "/items/" + id(itemId) + "/children?$select=id,name,folder&$top=200";
        for (JsonNode child : http.getJson(url, token).path("value")) {
            if (child.has("folder")) out.add(new Place(driveId, child.path("id").asText(), child.path("name").asText(), "folder"));
        }
        return out;
    }

    public Item item(String base, String token, String driveId, String itemId) {
        return item(http.getJson(base + "/drives/" + id(driveId) + "/items/" + id(itemId) + "?$select=" + ITEM, token),
            driveId);
    }

    /** Un dossier ; lève, avec ce qu'il faut faire, pour un fichier. */
    public Item folder(String base, String token, String driveId, String itemId) {
        Item f = item(base, token, driveId, itemId);
        if (!f.folder()) throw new BusinessException("This is a file, not a folder. Choose a folder.");
        return f;
    }

    /**
     * La version du fichier, celle que SharePoint et OneDrive montrent (« 4.0 ») : la plus haute de son historique ; nulle
     * quand Microsoft n'en garde pas.
     */
    public String version(String base, String token, Item f) {
        try {
            String url = base + "/drives/" + id(f.driveId()) + "/items/" + id(f.id()) + "/versions?$select=id";
            String best = null;
            double top = -1;
            for (JsonNode v : http.getJson(url, token).path("value")) {
                String label = v.path("id").asText(null);
                if (label == null) continue;
                double n = number(label);
                if (best == null || n > top) {
                    best = label;
                    top = n;
                }
            }
            return best;
        } catch (CompanyApiHttp.VendorError e) {
            return null;
        }
    }

    /**
     * Les fichiers que la personne peut lire, par leur nom ou leur texte : Microsoft Search (OneDrive, SharePoint, ce qui
     * est partagé avec elle) ; sans lui (un compte personnel), son seul OneDrive ; sans mot, ses fichiers récents.
     */
    public List<Item> search(String base, String token, String query) {
        String text = query == null ? "" : query.strip();
        if (text.isEmpty()) return items(http.getJson(base + "/me/drive/recent?$top=10", token).path("value"));
        try {
            Map<String, Object> request = Map.of("entityTypes", List.of("driveItem"),
                "query", Map.of("queryString", text), "from", 0, "size", 10);
            JsonNode r = http.postJson(base + "/search/query", token, Map.of("requests", List.of(request)));
            List<Item> out = new ArrayList<>();
            for (JsonNode container : r.path("value").path(0).path("hitsContainers")) {
                for (JsonNode hit : container.path("hits")) out.add(item(hit.path("resource"), null));
            }
            return out;
        } catch (CompanyApiHttp.VendorError e) {
            String q = text.replace("'", "''");
            return items(http.getJson(base + "/me/drive/root/search(q='" + segment(q) + "')?$top=10&$select=" + ITEM, token)
                .path("value"));
        }
    }

    /** Le texte d'un fichier, lu à l'instant : un fichier texte, un document Word ou PowerPoint. */
    public String text(String base, String token, Item f, int maxChars) {
        if (f.folder()) throw new BusinessException("This is a folder: choose a file in it.");
        String url = base + "/drives/" + id(f.driveId()) + "/items/" + id(f.id()) + "/content";
        if (GoogleDriveApi.textual(f.mimeType()) || textName(f.name())) {
            String s = new String(http.getBytes(url, token, CompanyApiHttp.MAX_BYTES), StandardCharsets.UTF_8);
            return s.length() > maxChars ? s.substring(0, maxChars) : s;
        }
        if (OfficeText.readable(f.mimeType(), f.name())) {
            return OfficeText.extract(http.getBytes(url, token, CompanyApiHttp.MAX_BYTES), f.mimeType(), f.name(), maxChars);
        }
        throw new BusinessException("TaskForce can't read this kind of file yet (" + f.name() + "): open it in OneDrive "
            + "or SharePoint.");
    }

    /** Range un fichier dans un dossier ; un fichier du même nom reste, le nouveau prend un nom libre. */
    public Item upload(String base, String token, String driveId, String folderId, String name, String mediaType,
                       byte[] content) {
        String url = base + "/drives/" + id(driveId) + "/items/" + id(folderId) + ":/" + segment(name)
            + ":/content?@microsoft.graph.conflictBehavior=rename";
        return item(http.putBytes(url, token, content, mediaType), driveId);
    }

    // --- Teams -------------------------------------------------------------

    /** Les équipes de la personne et leurs canaux (vingt équipes au plus). */
    public List<Team> teams(String base, String token) {
        List<Team> out = new ArrayList<>();
        for (JsonNode t : http.getJson(base + "/me/joinedTeams?$select=id,displayName", token).path("value")) {
            if (out.size() >= 20) break;
            String teamId = t.path("id").asText();
            List<Channel> channels = new ArrayList<>();
            for (JsonNode c : http.getJson(base + "/teams/" + seg(teamId) + "/channels?$select=id,displayName", token)
                    .path("value")) {
                channels.add(new Channel(c.path("id").asText(), c.path("displayName").asText()));
            }
            out.add(new Team(teamId, t.path("displayName").asText(), channels));
        }
        return out;
    }

    public List<Message> channelMessages(String base, String token, String teamId, String channelId) {
        return messages(http.getJson(base + "/teams/" + seg(teamId) + "/channels/" + seg(channelId) + "/messages?$top="
            + MESSAGES, token));
    }

    /** Les conversations de la personne : leur sujet, ou leurs membres. */
    public List<Chat> chats(String base, String token) {
        List<Chat> out = new ArrayList<>();
        for (JsonNode c : http.getJson(base + "/me/chats?$top=20&$expand=members", token).path("value")) {
            String topic = c.path("topic").asText(null);
            if (topic == null || topic.isBlank()) {
                List<String> names = new ArrayList<>();
                c.path("members").forEach(m -> {
                    String n = m.path("displayName").asText(null);
                    if (n != null && !n.isBlank()) names.add(n);
                });
                topic = names.isEmpty() ? "Chat" : String.join(", ", names);
            }
            out.add(new Chat(c.path("id").asText(), topic));
        }
        return out;
    }

    public List<Message> chatMessages(String base, String token, String chatId) {
        return messages(http.getJson(base + "/chats/" + seg(chatId) + "/messages?$top=" + MESSAGES, token));
    }

    public Message postToChannel(String base, String token, String teamId, String channelId, String text) {
        return message(http.postJson(base + "/teams/" + seg(teamId) + "/channels/" + seg(channelId) + "/messages", token,
            body(text)));
    }

    public Message postToChat(String base, String token, String chatId, String text) {
        return message(http.postJson(base + "/chats/" + seg(chatId) + "/messages", token, body(text)));
    }

    // -------------------------------------------------------------------------

    private static Map<String, Object> body(String text) {
        if (text == null || text.isBlank()) throw new BusinessException("The message is empty.");
        return Map.of("body", Map.of("contentType", "text", "content", text.strip()));
    }

    private static List<Message> messages(JsonNode list) {
        List<Message> out = new ArrayList<>();
        for (JsonNode m : list.path("value")) {
            if (!"message".equals(m.path("messageType").asText("message"))) continue;
            out.add(message(m));
        }
        return out;
    }

    private static Message message(JsonNode m) {
        String from = m.path("from").path("user").path("displayName").asText(null);
        if (from == null) from = m.path("from").path("application").path("displayName").asText("Someone");
        return new Message(m.path("id").asText(null), from, m.path("createdDateTime").asText(null),
            plain(m.path("body").path("content").asText("")), m.path("webUrl").asText(null));
    }

    /** Le texte d'un message de Teams, sans ses balises. */
    static String plain(String html) {
        return html.replaceAll("(?i)<br\\s*/?>|</p>|</div>", "\n").replaceAll("<[^>]{0,2000}>", "")
            .replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
            .replace("&quot;", "\"").replace("&#39;", "'").strip();
    }

    private static List<Item> items(JsonNode list) {
        List<Item> out = new ArrayList<>();
        for (JsonNode f : list) out.add(item(f, null));
        return out;
    }

    private static Item item(JsonNode f, String driveId) {
        String drive = f.path("parentReference").path("driveId").asText(null);
        if (drive == null) drive = driveId;
        String owner = f.path("createdBy").path("user").path("displayName").asText(null);
        return new Item(drive, f.path("id").asText(null), f.path("name").asText(null), f.has("folder"),
            f.path("file").path("mimeType").asText(null), f.path("webUrl").asText(null),
            f.path("lastModifiedDateTime").asText(null), f.path("lastModifiedBy").path("user").path("displayName").asText(null),
            owner, f.hasNonNull("size") ? f.path("size").asLong() : null);
    }

    private static boolean textName(String name) {
        String n = name == null ? "" : name.toLowerCase(Locale.ROOT);
        return n.endsWith(".txt") || n.endsWith(".md") || n.endsWith(".csv") || n.endsWith(".json");
    }

    /** Un numéro de version (« 4.0 ») ; -1 quand ce n'en est pas un. */
    private static double number(String label) {
        try {
            return Double.parseDouble(label);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    /** Un identifiant de Graph, jamais un chemin. */
    static String id(String raw) {
        String v = raw == null ? "" : raw.strip();
        if (!ID.matcher(v).matches()) throw new BusinessException("This isn't a OneDrive or SharePoint item.");
        return v;
    }

    /** Un identifiant de Teams, encodé pour le chemin (« 19:...@thread.tacv2 »). */
    private static String seg(String raw) {
        return enc(id(raw));
    }

    /** Un nom de fichier dans le chemin d'un envoi : encodé, l'espace en %20. */
    private static String segment(String name) {
        return enc(name).replace("+", "%20");
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
