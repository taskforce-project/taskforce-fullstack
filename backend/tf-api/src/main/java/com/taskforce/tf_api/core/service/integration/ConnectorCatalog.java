package com.taskforce.tf_api.core.service.integration;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.ConnectorDescriptor;
import com.taskforce.tf_api.core.dto.response.ConnectorField;
import com.taskforce.tf_api.core.enums.ConnectionPath;
import com.taskforce.tf_api.core.enums.ConnectorAuthType;
import com.taskforce.tf_api.core.enums.ConnectorCategory;
import com.taskforce.tf_api.core.enums.ToolClass;
import com.taskforce.tf_api.shared.exception.BusinessException;

import jakarta.annotation.PostConstruct;

/**
 * <b>Catalogue des intégrations</b> (ADR-020) : trois intégrations natives et des préréglages de serveurs MCP.
 *
 * <ul>
 *   <li><b>Natives</b> (Plane, GitHub, Slack) : flux de connexion dédié, lecture dans le Brain OS, actions
 *       écrites à la main.</li>
 *   <li><b>Préréglages MCP</b> : lus dans {@value #PRESETS} (R99, séance n°22 : des données, plus des lignes de
 *       Java), avec pour chacun sa catégorie, son serveur, son chemin de connexion, les portées strictement utiles,
 *       l'étape de l'administrateur et la classe de chaque outil connu.</li>
 * </ul>
 *
 * <p>Le catalogue montre chaque préréglage, à tous (décision de la Présidence, 12/11/2026) : {@code tried} dit
 * seulement lequel a été essayé de bout en bout, avec sa preuve.</p>
 */
@Component
public class ConnectorCatalog {

    /** Le fichier des préréglages, dans les ressources du backend. */
    static final String PRESETS = "connectors/presets.json";

    private static final ObjectMapper JSON = new ObjectMapper();

    private final Map<String, ConnectorDescriptor> byKey = new LinkedHashMap<>();

    @PostConstruct
    public void build() {
        byKey.clear();
        // Une ligne sur ce que fait chaque native, à côté des préréglages (rejeu de la 1.8.0, 02/11/2026).
        nativeIntegration("plane", "Plane", ConnectorCategory.TICKETS_PROJECTS, ConnectorAuthType.API_KEY,
            "Syncs your Plane projects and work items into the workspace's knowledge.",
            "https://developers.plane.so/api-reference/introduction",
            "In Plane: your avatar > Settings > Personal access tokens > Add token, then paste the key here. "
            + "The workspace slug is in the URL: app.plane.so/<slug>/...",
            List.of(ConnectorField.secret("apiKey", "Plane API key"),
                    ConnectorField.text("planeWorkspace", "Plane workspace slug")),
            List.of("observe"), "https://plane.so");
        nativeIntegration("github", "GitHub", ConnectorCategory.CODE, ConnectorAuthType.OAUTH2,
            "Links pull requests and commits to your issues; a merged pull request completes its issue.",
            "https://docs.github.com",
            "One-click connect: you are redirected to GitHub to authorize access. Nothing to copy.",
            List.of(), List.of("observe", "act"), "https://github.com");
        nativeIntegration("slack", "Slack", ConnectorCategory.CHAT_MAIL, ConnectorAuthType.OAUTH2,
            "Posts issue notifications to your channels and brings their history into the workspace's knowledge.",
            "https://api.slack.com",
            "One-click connect: you are redirected to Slack to authorize the app. Nothing to copy.",
            List.of(), List.of("observe", "act"), "https://slack.com");
        for (ConnectorPreset preset : readPresets()) {
            if (byKey.containsKey(preset.key())) {
                throw new IllegalStateException("Duplicate connector key in " + PRESETS + ": " + preset.key());
            }
            byKey.put(preset.key(), new ConnectorDescriptor(preset.key(), preset.name(), preset.category(),
                ConnectorAuthType.MCP, List.of(), List.of("mcp"), null, preset.description(), null,
                preset.website(), preset.mcpUrl(), preset));
        }
    }

    /** Tous les outils, dans l'ordre de déclaration : les natives, puis les préréglages dans l'ordre du fichier. */
    public List<ConnectorDescriptor> all() {
        return new ArrayList<>(byKey.values());
    }

    public Optional<ConnectorDescriptor> byKey(String key) {
        return Optional.ofNullable(key == null ? null : byKey.get(key));
    }

    /** Le préréglage MCP de cette clé ; vide pour une native, un serveur personnalisé ou une clé inconnue. */
    public Optional<ConnectorPreset> preset(String key) {
        return byKey(key).map(ConnectorDescriptor::preset);
    }

    /** Préréglage de serveur MCP ? (faux pour une intégration native et pour une clé inconnue) */
    public boolean isMcpPreset(String key) {
        return byKey(key).map(d -> d.authType() == ConnectorAuthType.MCP).orElse(false);
    }

    /** Préréglage essayé de bout en bout ? (faux pour une native, une clé inconnue et un préréglage jamais essayé) */
    public boolean isTriedPreset(String key) {
        return preset(key).map(ConnectorPreset::isTried).orElse(false);
    }

    /**
     * La classe d'un outil, décidée par TaskForce (R158) : celle que lui donne le préréglage du serveur ; un outil
     * qu'il ne nomme pas, ou un serveur sans préréglage (ajouté à la main), est une écriture.
     */
    public ToolClass classOf(String connectorKey, String tool) {
        return preset(connectorKey).map(p -> p.classOf(tool)).orElse(ToolClass.WRITE);
    }

    /**
     * La classe d'un outil servi par ce serveur : celle du préréglage seulement quand le serveur est le sien (son serveur
     * officiel) ; tout autre serveur, même enregistré sous la clé d'un préréglage, n'a que des écritures.
     */
    public ToolClass classOn(String connectorKey, String serverUrl, String tool) {
        return preset(connectorKey).filter(p -> p.serves(serverUrl)).map(p -> p.classOf(tool)).orElse(ToolClass.WRITE);
    }

    /**
     * L'adresse que joint une connexion de cette clé : pour un préréglage qui a un serveur officiel, toujours celui-ci (sa
     * lecture seule quand l'écriture n'est pas accordée), et une demande qui nomme une autre adresse est refusée ; pour un
     * serveur ajouté à la main, ou celui que l'entreprise crée chez l'éditeur, l'adresse demandée (nulle si elle manque).
     */
    public String serverFor(String connectorKey, String requested, boolean writes) {
        String asked = requested == null || requested.isBlank() ? null : requested.strip();
        Optional<ConnectorPreset> preset = preset(connectorKey);
        if (preset.isEmpty()) return asked;
        assertAddress(preset.get(), asked);
        return preset.get().hasOfficialServer() ? preset.get().urlFor(writes) : asked;
    }

    /**
     * Refuse une adresse que la clé d'un préréglage ne peut pas joindre : autre chose que son serveur officiel, ou une
     * adresse pour un outil que TaskForce sert par l'API de son éditeur. Sans effet pour une autre clé.
     */
    public void assertAddress(String connectorKey, String url) {
        preset(connectorKey).ifPresent(p -> assertAddress(p, url == null || url.isBlank() ? null : url.strip()));
    }

    private static void assertAddress(ConnectorPreset preset, String url) {
        if (url == null) return;
        if (preset.api() != null) {
            throw new BusinessException(preset.name() + " connects through its own sign-in, not by an address.");
        }
        if (preset.hasOfficialServer() && !preset.serves(url)) {
            throw new BusinessException(preset.name() + " connects only to its official server ("
                + java.net.URI.create(preset.mcpUrl()).getHost() + ").");
        }
    }

    // -------------------------------------------------------------------------

    private void nativeIntegration(String key, String name, ConnectorCategory cat, ConnectorAuthType auth,
                                   String description, String docsUrl, String setupHint,
                                   List<ConnectorField> fields, List<String> caps, String websiteUrl) {
        byKey.put(key, new ConnectorDescriptor(key, name, cat, auth, fields, caps, docsUrl, description, setupHint,
            websiteUrl, null, null));
    }

    /** Lit et vérifie le fichier des préréglages : une erreur de déclaration arrête le démarrage, pas l'écran. */
    static List<ConnectorPreset> readPresets() {
        try (InputStream in = ConnectorCatalog.class.getClassLoader().getResourceAsStream(PRESETS)) {
            if (in == null) throw new IllegalStateException("Missing " + PRESETS);
            JsonNode root = JSON.readTree(in);
            List<ConnectorPreset> out = new ArrayList<>();
            for (JsonNode node : root.path("presets")) out.add(preset(node));
            return out;
        } catch (IOException e) {
            throw new IllegalStateException("Unreadable " + PRESETS + ": " + e.getMessage(), e);
        }
    }

    private static ConnectorPreset preset(JsonNode n) {
        String key = required(n, "key");
        ConnectionPath connection = ConnectionPath.of(required(n, "connection"));
        String mcpUrl = text(n, "mcpUrl");
        ConnectorPreset.Api api = api(key, n.path("api"));
        if (mcpUrl == null && connection != ConnectionPath.SERVER_URL && api == null) {
            throw new IllegalStateException("Preset " + key + " has no mcpUrl");
        }
        if (mcpUrl != null && !mcpUrl.startsWith("https://")) {
            throw new IllegalStateException("Preset " + key + " must use an HTTPS server");
        }
        Set<String> read = names(n.path("tools").path("read"));
        Set<String> write = names(n.path("tools").path("write"));
        Set<String> both = new LinkedHashSet<>(read);
        both.retainAll(write);
        if (!both.isEmpty()) throw new IllegalStateException("Preset " + key + " classes a tool twice: " + both);
        JsonNode scopes = n.path("scopes");
        JsonNode admin = n.path("admin");
        JsonNode apiKey = n.path("apiKey");
        JsonNode tried = n.path("tried");
        return new ConnectorPreset(key, required(n, "name"), ConnectorCategory.valueOf(required(n, "category")),
            required(n, "description"), required(n, "website"), mcpUrl, text(n, "readUrl"), connection,
            scopes.isObject() ? new ConnectorPreset.Scopes(list(scopes.path("read")), list(scopes.path("write")))
                : ConnectorPreset.Scopes.NONE,
            admin.isObject() ? new ConnectorPreset.Admin(admin.path("required").asBoolean(false),
                required(admin, "text"), text(admin, "link")) : null,
            apiKey.isObject() ? new ConnectorPreset.ApiKey(required(apiKey, "hint"), text(apiKey, "link"),
                text(apiKey, "header")) : null,
            Collections.unmodifiableSet(read), Collections.unmodifiableSet(write),
            tried.isObject() ? new ConnectorPreset.Tried(required(tried, "date"), required(tried, "proof")) : null,
            text(n, "blocked"), list(n.path("sources")), list(n.path("unverified")), api);
    }

    /** L'API d'un éditeur que TaskForce sert lui-même : son émetteur et son adresse, en HTTPS. */
    private static ConnectorPreset.Api api(String key, JsonNode a) {
        if (a == null || !a.isObject()) return null;
        String issuer = required(a, "issuer");
        String base = required(a, "base");
        if (!issuer.startsWith("https://") || !base.startsWith("https://")) {
            throw new IllegalStateException("Preset " + key + " must use an HTTPS sign-in server and API");
        }
        Map<String, String> authorize = new LinkedHashMap<>();
        a.path("authorize").fields().forEachRemaining(f -> authorize.put(f.getKey(), f.getValue().asText()));
        return new ConnectorPreset.Api(required(a, "kind"), issuer, base, required(a, "app"),
            Collections.unmodifiableMap(authorize));
    }

    private static String required(JsonNode n, String field) {
        String value = text(n, field);
        if (value == null) throw new IllegalStateException("A preset in " + PRESETS + " misses " + field);
        return value;
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() || v.asText().isBlank() ? null : v.asText();
    }

    private static List<String> list(JsonNode array) {
        List<String> out = new ArrayList<>();
        if (array != null && array.isArray()) array.forEach(v -> out.add(v.asText()));
        return List.copyOf(out);
    }

    private static Set<String> names(JsonNode array) {
        Set<String> out = new LinkedHashSet<>();
        if (array != null && array.isArray()) array.forEach(v -> out.add(v.asText()));
        return out;
    }
}
