package com.taskforce.tf_api.core.service.mcp;

import java.net.URI;
import java.text.Normalizer;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.enums.ConnectionScope;
import com.taskforce.tf_api.core.enums.ConnectionState;
import com.taskforce.tf_api.core.enums.ToolClass;
import com.taskforce.tf_api.core.harness.evidence.CanonicalJson;
import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;
import com.taskforce.tf_api.core.service.AuditService;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;
import com.taskforce.tf_api.core.service.integration.ConnectorCatalog;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Découvre les <b>serveurs MCP externes</b> qu'une personne peut utiliser dans un workspace et expose leurs outils à
 * l'agent Cortex sous forme d'{@link AgentTool} ({@link ExternalMcpTool}). C'est le pont qui fait de TaskForce un
 * <b>hôte MCP</b> : la boucle de tool-calling ({@code AgentService.runToolLoop}) fusionne ces outils externes avec les
 * outils internes.
 *
 * <p><b>Une connexion par personne</b> (séance n°22, R154) : une personne utilise ses propres connexions, et celles
 * que l'espace partage pour un outil qu'elle n'a pas connecté elle-même ; jamais la connexion d'une autre personne.
 * Le cache des outils est donc tenu par personne.</p>
 *
 * <p><b>La sécurité côté connexion</b> (R158) : la classe de chaque outil (lecture ou écriture) vient du préréglage, un
 * outil inconnu est une écriture ; la liste des outils est figée à la connexion (empreinte de chaque outil), et un
 * outil dont la description ou le schéma change, ou qui apparaît, n'est plus servi tant qu'une personne n'a pas
 * redonné son accord ({@link #approveTools}).</p>
 *
 * <p>Un connecteur est un « serveur MCP » si sa config (déchiffrée) porte un champ {@code mcpUrl} (+ {@code mcpToken}
 * optionnel, relayé en {@code Authorization: Bearer} ou dans l'en-tête {@code mcpHeader}). Sa clé est celle d'un
 * préréglage du catalogue, ou {@code custom-<slug>} pour un serveur ajouté à la main, dont le nom est gardé dans
 * {@code mcpName} (ADR-020). La découverte fait un {@code initialize}+{@code tools/list} par serveur ; le résultat est
 * <b>mis en cache (TTL court)</b>. Un serveur en échec est <b>ignoré</b> (log) sans casser l'agent.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WorkspaceMcpService {

    /** Champ de config marquant un connecteur comme serveur MCP + son éventuel token de pass-through. */
    static final String CONFIG_URL = "mcpUrl";
    static final String CONFIG_TOKEN = "mcpToken";
    /** Allow-list optionnelle (CSV de noms d'outils d'origine) : si présente, seuls ces outils sont exposés. */
    static final String CONFIG_ALLOW = "mcpAllow";
    /** Nom affiché d'un serveur personnalisé. */
    static final String CONFIG_NAME = "mcpName";
    /** En-tête qui porte {@code mcpToken} tel quel (ex. {@code X-API-Key}) ; absent = {@code Authorization: Bearer}. */
    static final String CONFIG_HEADER = "mcpHeader";
    /** Un serveur sur la machine ou le réseau local, accordé explicitement par la personne : quand, par qui. */
    static final String CONFIG_LOCAL_APPROVED = "mcpLocalApprovedAt";
    /** Clé demandée par le client pour un nouveau serveur personnalisé ; la clé définitive dérive du nom. */
    public static final String NEW_CUSTOM_KEY = "custom";
    private static final String CUSTOM_PREFIX = "custom-";
    private static final Pattern CUSTOM_KEY = Pattern.compile("custom-[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?");
    private static final int MAX_NAME = 60;
    private static final int MAX_SLUG = 32;
    private static final Pattern HEADER_NAME = Pattern.compile("[A-Za-z0-9-]{1,64}");
    /** En-têtes que le transport pose lui-même, ou que le client HTTP du JDK refuse. */
    private static final Set<String> RESERVED_HEADERS = Set.of("accept", "connection", "content-length",
        "content-type", "expect", "host", "keep-alive", "mcp-protocol-version", "mcp-session-id", "te", "trailer",
        "transfer-encoding", "upgrade");
    /** Séparateur de namespace des outils externes : {@code <connecteur>__<outil>}. */
    static final String NS = "__";

    /**
     * Statut d'une connexion à un serveur MCP, pour la personne qui la regarde. {@code host} : l'hôte du serveur, jamais
     * son adresse entière (celle d'un serveur Zoho vaut une clé). {@code tools} : les outils servis ; {@code changedTools}
     * : ceux qui ont changé depuis la connexion et attendent un nouvel accord.
     */
    public record McpServerStatus(String connectorKey, String name, String host, ConnectionScope scope,
                                  ConnectionState state, String accountLabel, boolean reachable, List<String> tools,
                                  List<String> changedTools, String error) {}

    /** Serveur MCP qu'une personne peut utiliser, lu sans appel réseau (pour le catalogue). {@code name} : serveur
     *  personnalisé seulement. */
    public record ConnectedServer(String connectorKey, String name, String url, ConnectionScope scope,
                                  ConnectionState state, String accountLabel) {
        public ConnectedServer(String connectorKey, String name, String url) {
            this(connectorKey, name, url, ConnectionScope.WORKSPACE, ConnectionState.CONNECTED, null);
        }
    }

    /** Clé et nom sous lesquels enregistrer un serveur ({@code name} nul pour un préréglage). */
    public record ServerIdentity(String connectorKey, String name) {}

    /** Ce que la déconnexion a fait chez l'éditeur : révoqué, ou pas de révocation possible (R154). */
    public record DisconnectResult(boolean revoked, boolean revocable) {}

    /**
     * Outil MCP <b>riche</b> (schéma d'arguments inclus) : alimente la console d'actions (TF-MCP-06). {@code
     * inputSchema} = JSON Schema brut du serveur (rendu en formulaire côté front) ; {@code readOnly} : la classe décidée
     * par TaskForce (une écriture demande confirmation) ; {@code changed} : l'outil a changé depuis la connexion.
     */
    public record McpToolInfo(String name, String description, JsonNode inputSchema, boolean readOnly,
                              boolean changed) {
        public McpToolInfo(String name, String description, JsonNode inputSchema, boolean readOnly) {
            this(name, description, inputSchema, readOnly, false);
        }
    }

    /** Un serveur local accordé par la personne demande cet accord explicite avant d'être enregistré. */
    public static class LocalServerNeedsApproval extends BusinessException {
        public LocalServerNeedsApproval(String host) {
            super("This server runs on your computer or your local network (" + host + "). Connect it only if you "
                + "started it yourself.");
        }
    }

    private final ConnectorConnectionRepository repository;
    private final McpClient client;
    private final ObjectMapper objectMapper;
    private final McpTokenService tokenService; // OAuth (TF-MCP-02) : access token géré + refresh auto
    private final ConnectorCatalog catalog;
    /** Sa propre connexion : un membre ; une connexion partagée : un propriétaire ou un administrateur (règle 3). */
    private final AuthorizationService authorization;
    /** Une connexion partagée faite ou défaite entre au journal de l'espace (séance n°23, R160). */
    private final AuditService audit;

    @Value("${integrations.mcp.tools-cache-ttl-ms:60000}")
    private long cacheTtlMs;

    /**
     * Les outils des éditeurs que TaskForce sert par leur API (Google Drive, Microsoft 365), sans serveur MCP : la même
     * connexion, les mêmes règles. Absents, ces connexions ne servent aucun outil.
     */
    private CompanyApiTools apiTools;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setApiTools(CompanyApiTools apiTools) {
        this.apiTools = apiTools;
    }

    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    private record Cached(long expiresAt, List<AgentTool> tools) {}

    /**
     * Outils externes (MCP) disponibles pour la personne du contexte, dans son workspace. Jamais {@code null} ; liste
     * vide si aucun serveur MCP n'est connecté ou si tous sont injoignables. Résultat caché (TTL), par personne.
     */
    public List<AgentTool> toolsFor(AgentContext ctx) {
        String key = cacheKey(ctx.workspaceId(), ctx.userId());
        long now = System.currentTimeMillis();
        Cached cached = cache.get(key);
        if (cached != null && cached.expiresAt() > now) {
            return cached.tools();
        }
        List<AgentTool> tools = discover(ctx.workspaceId(), ctx.userId());
        cache.put(key, new Cached(now + cacheTtlMs, tools));
        return tools;
    }

    /** Serveurs MCP qu'une personne peut utiliser (les siens, ceux que l'espace partage), sans les sonder. */
    @Transactional(readOnly = true)
    public List<ConnectedServer> connectedServers(Long workspaceId, Long userId) {
        List<ConnectedServer> out = new ArrayList<>();
        for (ConnectorConnection conn : repository.findUsable(workspaceId, userId)) {
            Map<String, String> config = readConfig(conn.getConfig());
            String url = config.getOrDefault(CONFIG_URL, "").trim();
            if (url.isEmpty() && conn.getState() != ConnectionState.WAITING_FOR_ADMIN) continue;
            out.add(new ConnectedServer(conn.getConnectorKey(), config.get(CONFIG_NAME), url, conn.getScope(),
                conn.getState(), conn.getAccountLabel()));
        }
        return out;
    }

    /** Invalide le cache d'un workspace, pour toutes ses personnes (après (dé)connexion d'un serveur MCP). */
    public void invalidate(Long workspaceId) {
        String prefix = workspaceId + ":";
        cache.keySet().removeIf(k -> k.startsWith(prefix));
    }

    /**
     * La connexion qu'une personne utilise pour un outil : la sienne, sinon celle que l'espace partage. Jamais celle
     * d'une autre personne.
     */
    @Transactional(readOnly = true)
    public Optional<ConnectorConnection> connectionFor(Long workspaceId, Long userId, String connectorKey) {
        Optional<ConnectorConnection> own = userId == null ? Optional.empty()
            : repository.findByWorkspaceIdAndConnectorKeyAndOwnerId(workspaceId, connectorKey, userId);
        return own.isPresent() ? own : repository.findByWorkspaceIdAndConnectorKeyAndOwnerIsNull(workspaceId, connectorKey);
    }

    /**
     * Un outil externe tel que Cortex le voit, par sa référence {@code <connecteur>__<outil>} (nom d'origine ou nom
     * exposé, assaini et borné, cf. {@link ExternalMcpTool}) : par la connexion que cette personne utilise, figé, avec
     * sa classe. Vide si l'outil n'est pas servi (inconnu, hors de l'allow-list, changé depuis la connexion).
     */
    public Optional<ExternalMcpTool> toolFor(Long workspaceId, Long userId, String toolRef) {
        int sep = toolRef == null ? -1 : toolRef.indexOf(NS);
        if (sep <= 0) throw new BusinessException("Invalid tool reference: " + toolRef);
        String connectorKey = toolRef.substring(0, sep);
        String toolName = toolRef.substring(sep + NS.length());
        List<ExternalMcpTool> candidates = new ArrayList<>();
        for (AgentTool tool : toolsFor(new AgentContext(null, workspaceId, userId))) {
            if (tool instanceof ExternalMcpTool external && external.connectorKey().equals(connectorKey)
                    && (external.originalName().equals(toolName) || external.name().equals(toolRef))) {
                candidates.add(external);
            }
        }
        // À nom assaini égal, le nom d'origine identique à la référence l'emporte.
        return candidates.stream().filter(t -> t.originalName().equals(toolName)).findFirst()
            .or(() -> candidates.stream().findFirst());
    }

    /**
     * Exécute un outil externe pour une personne, par la connexion qu'elle utilise : ce qui décide (règles, accord,
     * dossier) a eu lieu avant, chez l'appelant ({@code McpActionService}, l'import, l'accord d'une carte de Cortex).
     * Un outil qui n'est pas servi (inconnu, hors de l'allow-list, changé depuis la connexion) ne s'exécute pas.
     */
    public String execute(Long workspaceId, Long userId, String toolRef, Map<String, Object> args) {
        ExternalMcpTool tool = toolFor(workspaceId, userId, toolRef)
            .orElseThrow(() -> new ResourceNotFoundException("MCP tool not available: " + toolRef));
        return tool.execute(args, new AgentContext(null, workspaceId, userId));
    }

    /**
     * Clé et nom sous lesquels enregistrer un serveur MCP. Un préréglage du catalogue garde sa clé (son nom est
     * celui du catalogue). Un serveur personnalisé exige un nom : {@link #NEW_CUSTOM_KEY} en crée un nouveau, dont
     * la clé {@code custom-<slug>} dérive du nom (suffixée si elle est prise) ; une clé {@code custom-…} le
     * reconfigure. Une intégration native ou toute autre clé est refusée : la première a son propre flux, la
     * seconde ne désigne rien.
     */
    @Transactional(readOnly = true)
    public ServerIdentity resolveServer(Long workspaceId, String connectorKey, String name) {
        if (catalog.isMcpPreset(connectorKey)) return new ServerIdentity(connectorKey, null);
        boolean isNew = NEW_CUSTOM_KEY.equals(connectorKey);
        if (!isNew && (connectorKey == null || !CUSTOM_KEY.matcher(connectorKey).matches())) {
            throw new BusinessException("Unknown MCP server: " + connectorKey);
        }
        String clean = name == null ? "" : name.strip();
        if (clean.isEmpty()) throw new BusinessException("Give your MCP server a name");
        if (clean.length() > MAX_NAME) {
            throw new BusinessException("The name of an MCP server is limited to " + MAX_NAME + " characters");
        }
        return new ServerIdentity(isNew ? freeCustomKey(workspaceId, clean) : connectorKey, clean);
    }

    /** Une connexion à un serveur, telle que la personne la demande : par adresse, avec ou sans clé. */
    public record ServerRequest(String connectorKey, String name, String mcpUrl, String token, String authHeader,
                                String allow, boolean shared, boolean localApproved) {}

    /**
     * Connecte (ou reconfigure) un serveur MCP : pour la personne (par défaut, un membre), ou partagé avec l'espace (un
     * propriétaire ou un administrateur, vérifié ici). Persiste {@code mcpUrl}, le nom d'un serveur personnalisé et, au
     * choix, un jeton relayé en {@code Authorization: Bearer} ou dans l'en-tête nommé, en JSON <b>chiffré</b>, puis fige
     * la liste de ses outils et invalide le cache. Un serveur local (la machine, le réseau local) ne se connecte que sur
     * une instance qui l'admet (l'app desktop) et avec l'accord explicite de la personne. Renvoie la clé et le nom
     * retenus.
     */
    @Transactional
    public ServerIdentity connectServer(Workspace ws, User person, ServerRequest req) {
        authorization.requireForConnection(ws.getId(), person == null ? null : person.getId(), req.shared());
        String mcpUrl = req.mcpUrl() == null ? "" : req.mcpUrl().trim();
        if (mcpUrl.isEmpty()) throw new BusinessException("Required field: mcpUrl");
        // La clé d'un préréglage ne mène qu'à son serveur officiel : ses classes d'outils ne valent que là (R158).
        catalog.assertAddress(req.connectorKey(), mcpUrl);
        boolean local = McpClient.isLocal(mcpUrl);
        // Refus immédiat d'une URL vers le réseau interne (OSS-1.2) ; le client revérifie avant chaque appel.
        client.assertAllowed(mcpUrl);
        if (local && !req.localApproved()) throw new LocalServerNeedsApproval(host(mcpUrl));
        ServerIdentity id = resolveServer(ws.getId(), req.connectorKey(), req.name());
        String token = req.token() == null ? "" : req.token().trim();
        String header = req.authHeader() == null ? "" : req.authHeader().trim();
        if (!header.isEmpty()) {
            if (!HEADER_NAME.matcher(header).matches() || RESERVED_HEADERS.contains(header.toLowerCase(Locale.ROOT))) {
                throw new BusinessException("This header can't carry the token: " + header);
            }
            if (token.isEmpty()) throw new BusinessException("Enter the value of the " + header + " header");
        }

        Map<String, String> config = new LinkedHashMap<>();
        config.put(CONFIG_URL, mcpUrl);
        if (id.name() != null) config.put(CONFIG_NAME, id.name());
        if (!token.isEmpty()) config.put(CONFIG_TOKEN, token);
        if (!header.isEmpty()) config.put(CONFIG_HEADER, header);
        if (req.allow() != null && !req.allow().isBlank()) config.put(CONFIG_ALLOW, req.allow().trim());
        if (local) config.put(CONFIG_LOCAL_APPROVED, LocalDateTime.now() + " user-" + person.getId());

        ConnectorConnection conn = ownConnection(ws, person, id.connectorKey(), req.shared());
        conn.setConfig(writeJson(config));
        conn.setState(ConnectionState.CONNECTED);
        conn.setConnectedBy(person);
        conn.setToolsPin(null);
        conn.setPinnedAt(null);
        repository.save(conn);
        pinQuietly(conn);
        invalidate(ws.getId());
        if (req.shared()) {
            recordShared(ws.getId(), person.getId(), id.connectorKey(), sharedDetails("connected", id, mcpUrl,
                token.isEmpty() ? "address" : "key"));
        }
        return id;
    }

    /**
     * Ce qu'une connexion partagée faite garde au journal : l'outil, le nom d'un serveur ajouté à la main, l'hôte du
     * serveur (jamais son adresse entière : celle d'un serveur Zoho vaut une clé), et comment elle s'est faite. Jamais un
     * jeton.
     */
    static Map<String, Object> sharedDetails(String change, ServerIdentity id, String url, String via) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("change", change);
        details.put("connectorKey", id.connectorKey());
        if (id.name() != null) details.put("name", id.name());
        String host = host(url);
        if (host != null) details.put("host", host);
        details.put("via", via);
        return details;
    }

    /**
     * Une connexion partagée faite ou défaite, au journal de l'espace, une fois le changement validé (best-effort, cf.
     * {@link AuditService#recordAfterCommit}).
     */
    void recordShared(Long workspaceId, Long userId, String connectorKey, Map<String, Object> details) {
        audit.recordAfterCommit(workspaceId, userId, AuditService.SHARED_CONNECTION_CHANGED, "connector_connection",
            connectorKey, details);
    }

    /**
     * La ligne de la connexion que la personne crée ou refait : la sienne, ou celle de l'espace quand elle la partage.
     * Une ligne neuve n'est pas encore enregistrée.
     */
    public ConnectorConnection ownConnection(Workspace ws, User person, String connectorKey, boolean shared) {
        if (!shared && (person == null || person.getId() == null)) {
            throw new BusinessException("A personal connection needs its person");
        }
        Optional<ConnectorConnection> existing = shared
            ? repository.findByWorkspaceIdAndConnectorKeyAndOwnerIsNull(ws.getId(), connectorKey)
            : repository.findByWorkspaceIdAndConnectorKeyAndOwnerId(ws.getId(), connectorKey, person.getId());
        return existing.orElseGet(() -> ConnectorConnection.builder().workspace(ws).connectorKey(connectorKey)
            .scope(shared ? ConnectionScope.WORKSPACE : ConnectionScope.PERSONAL).owner(shared ? null : person)
            .connectedBy(person).build());
    }

    /** {@code custom-<slug du nom>}, suffixé {@code -2}, {@code -3}… si un serveur du workspace l'utilise déjà. */
    private String freeCustomKey(Long workspaceId, String name) {
        String ascii = Normalizer.normalize(name, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        String slug = ascii.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
        if (slug.length() > MAX_SLUG) slug = slug.substring(0, MAX_SLUG).replaceAll("-+$", "");
        String base = CUSTOM_PREFIX + (slug.isEmpty() ? "server" : slug);
        String key = base;
        for (int n = 2; repository.existsByWorkspaceIdAndConnectorKey(workspaceId, key); n++) key = base + "-" + n;
        return key;
    }

    /**
     * Supprime les connexions sans serveur MCP : identifiants saisis dans le formulaire générique retiré au lot 6
     * (OSS-6.1), qu'aucun code ne lisait. Toute connexion enregistrée depuis porte un {@code mcpUrl}. Une config
     * illisible (chiffrée avec une autre clé, corrompue) est gardée : le convertisseur la rend telle quelle, et
     * rien ne prouve alors qu'elle n'a pas de serveur. Une connexion qui attend l'administrateur n'a pas encore de
     * serveur : elle reste.
     */
    @Transactional
    public int purgeConnectionsWithoutServer() {
        List<ConnectorConnection> stale = new ArrayList<>();
        for (ConnectorConnection conn : repository.findAll()) {
            if (conn.getState() == ConnectionState.WAITING_FOR_ADMIN) continue;
            Map<String, String> config = parseConfig(conn.getConfig());
            if (config != null && config.getOrDefault(CONFIG_URL, "").isBlank()) stale.add(conn);
        }
        repository.deleteAll(stale);
        return stale.size();
    }

    /**
     * Déconnecte un serveur MCP : la connexion de la personne, ou celle de l'espace ({@code shared}, par un propriétaire
     * ou un administrateur, vérifié ici). Révoque d'abord le jeton chez l'éditeur quand il offre la révocation
     * (RFC 7009), puis supprime la ligne et invalide le cache. Dit ce qui a été révoqué.
     */
    @Transactional
    public DisconnectResult disconnectServer(Long workspaceId, Long userId, String connectorKey, boolean shared) {
        authorization.requireForConnection(workspaceId, userId, shared);
        ConnectorConnection conn = (shared
            ? repository.findByWorkspaceIdAndConnectorKeyAndOwnerIsNull(workspaceId, connectorKey)
            : repository.findByWorkspaceIdAndConnectorKeyAndOwnerId(workspaceId, connectorKey, userId))
            .orElseThrow(() -> new ResourceNotFoundException("MCP server not connected: " + connectorKey));
        Map<String, String> config = readConfig(conn.getConfig());
        boolean revocable = tokenService.canRevoke(config);
        boolean revoked = revocable && tokenService.revoke(conn);
        repository.delete(conn);
        invalidate(workspaceId);
        if (shared) {
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("change", "disconnected");
            details.put("connectorKey", connectorKey);
            details.put("revoked", revoked);
            details.put("revocable", revocable);
            recordShared(workspaceId, userId, connectorKey, details);
        }
        return new DisconnectResult(revoked, revocable);
    }

    /**
     * Redonne l'accord à la liste actuelle des outils d'une connexion (R158) : les outils qui avaient changé, ou qui
     * sont apparus, sont de nouveau servis. La personne pour sa connexion ; un propriétaire ou un administrateur pour
     * celle de l'espace (vérifié ici), et ce nouvel accord entre au journal de l'espace.
     */
    @Transactional
    public void approveTools(Long workspaceId, Long userId, String connectorKey, boolean shared) {
        authorization.requireForConnection(workspaceId, userId, shared);
        ConnectorConnection conn = (shared
            ? repository.findByWorkspaceIdAndConnectorKeyAndOwnerIsNull(workspaceId, connectorKey)
            : repository.findByWorkspaceIdAndConnectorKeyAndOwnerId(workspaceId, connectorKey, userId))
            .orElseThrow(() -> new ResourceNotFoundException("MCP server not connected: " + connectorKey));
        McpClient.ServerRef ref = toServerRef(conn);
        if (ref == null) throw new BusinessException("The connector " + connectorKey + " is not an MCP server");
        McpClient.Session session = client.initialize(ref);
        int tools;
        try {
            List<McpClient.ToolDef> defs = client.listTools(session);
            pin(conn, defs);
            tools = defs == null ? 0 : defs.size();
        } finally {
            client.close(session);
        }
        invalidate(workspaceId);
        if (shared) {
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("change", "tools-approved");
            details.put("connectorKey", connectorKey);
            details.put("tools", tools);
            recordShared(workspaceId, userId, connectorKey, details);
        }
    }

    // -------------------------------------------------------------------------

    private String writeJson(Map<String, String> value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            return "{}";
        }
    }

    /** Les connexions que la personne utilise : la sienne pour un outil, sinon celle de l'espace. */
    private List<ConnectorConnection> usable(Long workspaceId, Long userId) {
        List<ConnectorConnection> all = repository.findUsable(workspaceId, userId);
        Set<String> own = new HashSet<>();
        for (ConnectorConnection c : all) if (c.getScope() == ConnectionScope.PERSONAL) own.add(c.getConnectorKey());
        List<ConnectorConnection> out = new ArrayList<>();
        for (ConnectorConnection c : all) {
            if (c.getScope() == ConnectionScope.WORKSPACE && own.contains(c.getConnectorKey())) continue;
            out.add(c);
        }
        return out;
    }

    private List<AgentTool> discover(Long workspaceId, Long userId) {
        List<AgentTool> tools = new ArrayList<>();
        for (ConnectorConnection conn : usable(workspaceId, userId)) {
            if (conn.getState() != ConnectionState.CONNECTED) continue;
            String api = McpTokenService.apiKind(readConfig(conn.getConfig()));
            if (api != null) {
                if (apiTools != null) tools.addAll(apiTools.toolsFor(conn, api, userId));
                continue;
            }
            McpClient.ServerRef ref = toServerRef(conn);
            if (ref == null) continue;
            Set<String> allow = allowList(conn);
            try {
                List<McpClient.ToolDef> defs = listTools(conn, ref);
                Set<String> held = held(conn, defs);
                for (McpClient.ToolDef def : defs) {
                    // Allow-list optionnelle : si définie, on n'expose que les outils autorisés.
                    if (!allow.isEmpty() && !allow.contains(def.name())) continue;
                    // Un outil changé ou apparu depuis la connexion attend un nouvel accord (R158).
                    if (held.contains(def.name())) continue;
                    tools.add(new ExternalMcpTool(client, refFor(conn, ref), def, objectMapper,
                        catalog.classOn(conn.getConnectorKey(), ref.serverUrl(), def.name()), conn.getScope()));
                }
            } catch (Exception e) {
                log.warn("Serveur MCP '{}' (ws={}) ignoré : {}", LogSafe.of(ref.connectorKey()), workspaceId, LogSafe.of(e.getMessage()));
            }
        }
        if (!tools.isEmpty()) {
            log.debug("Workspace {} : {} outil(s) MCP externe(s) découvert(s)", workspaceId, tools.size());
        }
        return tools;
    }

    /**
     * {@code initialize}+{@code tools/list}. Un 401 : le jeton est renouvelé une fois et l'appel refait ; un second
     * refus passe la connexion à « Needs reconnecting ». Une connexion jamais figée l'est à sa première liste.
     */
    private List<McpClient.ToolDef> listTools(ConnectorConnection conn, McpClient.ServerRef ref) {
        McpClient.Session session;
        try {
            session = client.initialize(ref);
        } catch (McpClient.Unauthorized unauthorized) {
            String renewed = tokenService.isOAuth(readConfig(conn.getConfig())) ? tokenService.refreshNow(conn) : null;
            if (renewed == null) {
                markNeedsReconnect(conn);
                throw unauthorized;
            }
            ref = new McpClient.ServerRef(ref.connectorKey(), ref.serverUrl(), renewed, ref.authHeader());
            session = client.initialize(ref);
        }
        try {
            List<McpClient.ToolDef> defs = client.listTools(session);
            if (conn.getToolsPin() == null) pinQuietly(conn, defs);
            return defs;
        } finally {
            client.close(session);
        }
    }

    /** La référence du serveur à jour : un jeton renouvelé pendant la liste remplace celui du début. */
    private McpClient.ServerRef refFor(ConnectorConnection conn, McpClient.ServerRef fallback) {
        McpClient.ServerRef fresh = toServerRef(conn);
        return fresh != null ? fresh : fallback;
    }

    private void markNeedsReconnect(ConnectorConnection conn) {
        try {
            conn.setState(ConnectionState.NEEDS_RECONNECT);
            repository.save(conn);
        } catch (RuntimeException e) {
            log.debug("Etat de la connexion '{}' non garde : {}", LogSafe.of(conn.getConnectorKey()), LogSafe.of(e.getMessage()));
        }
    }

    /**
     * Statut de chaque connexion qu'une personne peut voir (les siennes, celles de l'espace) : joignabilité, outils
     * servis et changés, état, compte. Fait un probe {@code initialize}+{@code tools/list} par serveur, pour l'écran
     * des connexions. Remonte l'erreur par serveur sans échouer globalement.
     */
    public List<McpServerStatus> serverStatuses(Long workspaceId, Long userId) {
        List<McpServerStatus> out = new ArrayList<>();
        for (ConnectorConnection conn : repository.findUsable(workspaceId, userId)) {
            Map<String, String> config = readConfig(conn.getConfig());
            String name = config.get(CONFIG_NAME);
            String url = config.getOrDefault(CONFIG_URL, "").trim();
            if (conn.getState() != ConnectionState.CONNECTED) {
                out.add(new McpServerStatus(conn.getConnectorKey(), name, host(url), conn.getScope(), conn.getState(),
                    conn.getAccountLabel(), false, List.of(), List.of(), null));
                continue;
            }
            // L'API d'un éditeur : ses outils sont ceux de TaskForce, connus d'avance, sans sonde.
            String api = McpTokenService.apiKind(config);
            if (api != null) {
                List<String> names = apiTools == null ? List.of()
                    : apiTools.infos(conn, api, userId).stream().map(McpToolInfo::name).toList();
                out.add(new McpServerStatus(conn.getConnectorKey(), name, host(url), conn.getScope(), conn.getState(),
                    conn.getAccountLabel(), true, names, List.of(), null));
                continue;
            }
            McpClient.ServerRef ref = toServerRef(conn);
            if (ref == null) continue;
            Set<String> allow = allowList(conn);
            try {
                List<McpClient.ToolDef> defs = listTools(conn, ref);
                Set<String> held = held(conn, defs);
                List<String> names = defs.stream().map(McpClient.ToolDef::name)
                    .filter(n -> allow.isEmpty() || allow.contains(n)).filter(n -> !held.contains(n)).toList();
                List<String> changed = defs.stream().map(McpClient.ToolDef::name).filter(held::contains).toList();
                out.add(new McpServerStatus(ref.connectorKey(), name, host(url), conn.getScope(), conn.getState(),
                    conn.getAccountLabel(), true, names, changed, null));
            } catch (Exception e) {
                out.add(new McpServerStatus(ref.connectorKey(), name, host(url), conn.getScope(), conn.getState(),
                    conn.getAccountLabel(), false, List.of(), List.of(), e.getMessage()));
            }
        }
        return out;
    }

    /**
     * Outils <b>riches</b> (schéma d'arguments inclus) de la connexion qu'une personne utilise pour un serveur : pour
     * la console d'actions (TF-MCP-06). Applique l'allow-list, dit la classe décidée par TaskForce et les outils changés
     * (qui ne se lancent pas). Lève si le connecteur n'est pas un serveur MCP ({@code mcpUrl} manquant) ou est
     * injoignable (l'appelant remonte l'erreur telle quelle).
     */
    public List<McpToolInfo> serverTools(Long workspaceId, Long userId, String connectorKey) {
        ConnectorConnection conn = connectionFor(workspaceId, userId, connectorKey)
            .orElseThrow(() -> new ResourceNotFoundException("MCP connector not connected: " + connectorKey));
        String api = McpTokenService.apiKind(readConfig(conn.getConfig()));
        if (api != null) return apiTools == null ? List.of() : apiTools.infos(conn, api, userId);
        McpClient.ServerRef ref = toServerRef(conn);
        if (ref == null) throw new BusinessException("The connector " + connectorKey + " is not an MCP server (mcpUrl missing)");
        Set<String> allow = allowList(conn);
        List<McpClient.ToolDef> defs = listTools(conn, ref);
        Set<String> held = held(conn, defs);
        List<McpToolInfo> out = new ArrayList<>();
        for (McpClient.ToolDef def : defs) {
            if (!allow.isEmpty() && !allow.contains(def.name())) continue;
            out.add(new McpToolInfo(def.name(), def.description(), def.inputSchema(),
                catalog.classOn(connectorKey, ref.serverUrl(), def.name()).reads(), held.contains(def.name())));
        }
        return out;
    }

    // --- La liste figée (R158) ------------------------------------------------

    /**
     * L'empreinte d'un outil : son nom, son titre, sa description et son schéma, en JSON canonique. Ce que voit le
     * modèle de l'outil ne change pas sans qu'elle change.
     */
    static String fingerprint(McpClient.ToolDef def) {
        ObjectNode node = new ObjectMapper().createObjectNode();
        node.put("name", def.name());
        if (def.title() != null) node.put("title", def.title());
        node.put("description", def.description() == null ? "" : def.description());
        if (def.inputSchema() != null) node.set("inputSchema", def.inputSchema());
        StringBuilder out = new StringBuilder();
        canonical(node, out);
        return EvidenceChain.sha256(out.toString());
    }

    /**
     * Le JSON d'un outil, clés triées, pour que l'ordre que choisit le serveur ne change pas l'empreinte. Comme
     * {@link CanonicalJson}, mais un schéma peut porter des nombres décimaux ({@code "minimum": 0.5}).
     */
    private static void canonical(JsonNode node, StringBuilder out) {
        if (node.isObject()) {
            List<String> keys = new ArrayList<>();
            node.fieldNames().forEachRemaining(keys::add);
            java.util.Collections.sort(keys);
            out.append('{');
            for (int i = 0; i < keys.size(); i++) {
                if (i > 0) out.append(',');
                out.append(new ObjectMapper().getNodeFactory().textNode(keys.get(i)).toString()).append(':');
                canonical(node.get(keys.get(i)), out);
            }
            out.append('}');
        } else if (node.isArray()) {
            out.append('[');
            for (int i = 0; i < node.size(); i++) {
                if (i > 0) out.append(',');
                canonical(node.get(i), out);
            }
            out.append(']');
        } else {
            out.append(node.toString());
        }
    }

    /** Fige la liste des outils de la connexion (son accord à la connexion, ou son nouvel accord). */
    void pin(ConnectorConnection conn, List<McpClient.ToolDef> defs) {
        Map<String, String> pin = new TreeMap<>();
        for (McpClient.ToolDef def : defs) pin.put(def.name(), fingerprint(def));
        try {
            conn.setToolsPin(objectMapper.writeValueAsString(Map.of("tools", pin)));
        } catch (Exception e) {
            conn.setToolsPin("{\"tools\":{}}");
        }
        conn.setPinnedAt(LocalDateTime.now());
        repository.save(conn);
    }

    /** Fige la liste à la connexion, sans échouer : un serveur injoignable la fige à sa première liste. */
    public void pinQuietly(ConnectorConnection conn) {
        McpClient.ServerRef ref = toServerRef(conn);
        if (ref == null) return;
        try {
            McpClient.Session session = client.initialize(ref);
            try {
                pin(conn, client.listTools(session));
            } finally {
                client.close(session);
            }
        } catch (Exception e) {
            log.debug("Liste des outils de '{}' non figee a la connexion : {}", LogSafe.of(conn.getConnectorKey()),
                LogSafe.of(e.getMessage()));
        }
    }

    private void pinQuietly(ConnectorConnection conn, List<McpClient.ToolDef> defs) {
        try {
            pin(conn, defs);
        } catch (RuntimeException e) {
            log.debug("Liste des outils de '{}' non figee : {}", LogSafe.of(conn.getConnectorKey()), LogSafe.of(e.getMessage()));
        }
    }

    /** Les outils changés ou apparus depuis que la liste a été figée ; aucun quand elle ne l'est pas encore. */
    private Set<String> held(ConnectorConnection conn, List<McpClient.ToolDef> defs) {
        Map<String, String> pin = readPin(conn);
        if (pin == null) return Set.of();
        Set<String> held = new HashSet<>();
        for (McpClient.ToolDef def : defs) {
            if (!fingerprint(def).equals(pin.get(def.name()))) held.add(def.name());
        }
        return held;
    }

    private Map<String, String> readPin(ConnectorConnection conn) {
        if (conn.getToolsPin() == null || conn.getToolsPin().isBlank()) return null;
        try {
            JsonNode tools = objectMapper.readTree(conn.getToolsPin()).path("tools");
            return objectMapper.convertValue(tools, new TypeReference<Map<String, String>>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    // -------------------------------------------------------------------------

    /** Allow-list (noms d'outils d'origine) d'un connecteur, depuis {@code mcpAllow} (CSV). Vide = tous. */
    private Set<String> allowList(ConnectorConnection conn) {
        String csv = readConfig(conn.getConfig()).getOrDefault(CONFIG_ALLOW, "");
        if (csv.isBlank()) return Set.of();
        Set<String> set = new HashSet<>();
        for (String s : csv.split(",")) {
            String t = s.trim();
            if (!t.isEmpty()) set.add(t);
        }
        return set;
    }

    /** Construit une référence serveur si le connecteur porte un {@code mcpUrl} ; sinon {@code null}. */
    private McpClient.ServerRef toServerRef(ConnectorConnection conn) {
        Map<String, String> config = readConfig(conn.getConfig());
        String url = config.getOrDefault(CONFIG_URL, "").trim();
        // L'API d'un éditeur n'est pas un serveur MCP : ni initialize, ni tools/list, ni liste figée à sonder.
        if (url.isEmpty() || McpTokenService.apiKind(config) != null) return null;
        // OAuth (TF-MCP-02) : access token géré (refresh auto), en Bearer ; sinon jeton collé, en Bearer ou dans
        // l'en-tête choisi.
        String token;
        String header = null;
        if (tokenService.isOAuth(config)) {
            token = tokenService.validAccessToken(conn);
        } else {
            String pasted = config.getOrDefault(CONFIG_TOKEN, "").trim();
            token = pasted.isEmpty() ? null : pasted;
            String named = config.getOrDefault(CONFIG_HEADER, "").trim();
            header = named.isEmpty() ? null : named;
        }
        return new McpClient.ServerRef(conn.getConnectorKey(), url, token, header);
    }

    /** L'hôte d'une adresse, ce que l'écran peut en montrer (jamais le chemin, qui peut porter une clé). */
    static String host(String url) {
        if (url == null || url.isBlank()) return null;
        try {
            URI u = URI.create(url.trim());
            String port = u.getPort() > 0 ? ":" + u.getPort() : "";
            return u.getHost() == null ? null : u.getHost() + port;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String cacheKey(Long workspaceId, Long userId) {
        return workspaceId + ":" + userId;
    }

    private Map<String, String> readConfig(String json) {
        Map<String, String> config = parseConfig(json);
        return config != null ? config : Map.of();
    }

    /** Config lue, ou {@code null} si elle ne se lit pas (à distinguer d'une config vide). */
    private Map<String, String> parseConfig(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, String>>() {});
        } catch (Exception ex) {
            return null;
        }
    }

    /** La classe qu'un outil de ce connecteur aurait (pour les gestes qui le jugent avant de le voir servi). */
    public ToolClass classOf(String connectorKey, String tool) {
        return catalog.classOf(connectorKey, tool);
    }
}
