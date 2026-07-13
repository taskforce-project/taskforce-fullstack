package com.taskforce.tf_api.core.service.mcp;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.PlanFeature;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.ConnectorConnection;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.PlanFeatureService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Découvre les <b>serveurs MCP externes</b> connectés sur un workspace et expose leurs outils à
 * l'agent Cortex sous forme d'{@link AgentTool} ({@link ExternalMcpTool}). C'est le pont qui fait de
 * TaskForce un <b>hôte MCP</b> : la boucle de tool-calling ({@code AgentService.runToolLoop}) fusionne
 * ces outils externes avec les outils internes.
 *
 * <p>Un connecteur du workspace est considéré « serveur MCP » si sa config (déchiffrée) porte un champ
 * {@code mcpUrl} (+ {@code mcpToken} optionnel, relayé en pass-through). La découverte fait un
 * {@code initialize}+{@code tools/list} par serveur ; le résultat est <b>mis en cache (TTL court)</b>.
 * Un serveur en échec est <b>ignoré</b> (log) sans casser l'agent.
 *
 * <p><b>Gating</b> : les outils externes ne sont exposés que si le plan du <b>propriétaire</b> du
 * workspace couvre {@link PlanFeature#INTEGRATIONS} (BUSINESS+). {@link #execute} sert le bouton
 * d'approbation humaine des écritures externes (l'agent <i>propose</i>, l'utilisateur <i>valide</i>).
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
    /** Séparateur de namespace des outils externes : {@code <connecteur>__<outil>}. */
    static final String NS = "__";

    /** Statut d'un serveur MCP connecté (pour l'UI de gestion des connexions). */
    public record McpServerStatus(String connectorKey, String url, boolean reachable, List<String> tools, String error) {}

    private final ConnectorConnectionRepository repository;
    private final WorkspaceRepository workspaceRepository;
    private final PlanFeatureService planFeatureService;
    private final McpClient client;
    private final ObjectMapper objectMapper;

    @Value("${integrations.mcp.tools-cache-ttl-ms:60000}")
    private long cacheTtlMs;

    private final Map<Long, Cached> cache = new ConcurrentHashMap<>();

    private record Cached(long expiresAt, List<AgentTool> tools) {}

    /**
     * Outils externes (MCP) disponibles pour le workspace du contexte. Jamais {@code null} ; liste
     * vide si le plan ne couvre pas les intégrations, si aucun serveur MCP n'est connecté, ou si tous
     * sont injoignables. Résultat caché (TTL).
     */
    public List<AgentTool> toolsFor(AgentContext ctx) {
        Long wsId = ctx.workspaceId();
        long now = System.currentTimeMillis();
        Cached cached = cache.get(wsId);
        if (cached != null && cached.expiresAt() > now) {
            return cached.tools();
        }
        List<AgentTool> tools = entitled(ctx.slug()) ? discover(wsId) : List.of();
        cache.put(wsId, new Cached(now + cacheTtlMs, tools));
        return tools;
    }

    /** Invalide le cache d'un workspace (après (dé)connexion d'un serveur MCP). */
    public void invalidate(Long workspaceId) {
        cache.remove(workspaceId);
    }

    /**
     * Exécute un outil externe (approbation humaine d'une écriture, ou lecture explicite). {@code
     * toolRef} = nom namespacé {@code <connecteur>__<outil>}. L'autorisation workspace + le gate plan
     * sont faits en amont par le contrôleur.
     */
    public String execute(Long workspaceId, String toolRef, Map<String, Object> args) {
        int sep = toolRef == null ? -1 : toolRef.indexOf(NS);
        if (sep <= 0) throw new BusinessException("Référence d'outil invalide : " + toolRef);
        String connectorKey = toolRef.substring(0, sep);
        String toolName = toolRef.substring(sep + NS.length());

        ConnectorConnection conn = repository.findByWorkspaceIdAndConnectorKey(workspaceId, connectorKey)
            .orElseThrow(() -> new ResourceNotFoundException("Connecteur MCP non connecté : " + connectorKey));
        McpClient.ServerRef ref = toServerRef(conn);
        if (ref == null) throw new BusinessException("Le connecteur " + connectorKey + " n'est pas un serveur MCP (mcpUrl manquant)");

        McpClient.Session session = client.initialize(ref);
        try {
            return client.callTool(session, toolName, args);
        } finally {
            client.close(session);
        }
    }

    /**
     * Connecte (ou reconfigure) un serveur MCP sur le workspace : persiste {@code mcpUrl}
     * (+ {@code mcpToken}/{@code mcpAllow} optionnels) en JSON <b>chiffré</b> et invalide le cache.
     * Autorisation + gate plan faits en amont par le contrôleur.
     */
    @Transactional
    public void connectServer(Workspace ws, String connectorKey, String mcpUrl, String mcpToken, String mcpAllow) {
        if (mcpUrl == null || mcpUrl.isBlank()) throw new BusinessException("Champ requis : mcpUrl");
        Map<String, String> config = new LinkedHashMap<>();
        config.put(CONFIG_URL, mcpUrl.trim());
        if (mcpToken != null && !mcpToken.isBlank()) config.put(CONFIG_TOKEN, mcpToken.trim());
        if (mcpAllow != null && !mcpAllow.isBlank()) config.put(CONFIG_ALLOW, mcpAllow.trim());

        ConnectorConnection conn = repository.findByWorkspaceIdAndConnectorKey(ws.getId(), connectorKey)
            .orElseGet(() -> ConnectorConnection.builder().workspace(ws).connectorKey(connectorKey).build());
        conn.setConfig(writeJson(config));
        repository.save(conn);
        invalidate(ws.getId());
    }

    /** Déconnecte un serveur MCP du workspace (supprime la ligne connecteur) + invalide le cache. */
    @Transactional
    public void disconnectServer(Long workspaceId, String connectorKey) {
        if (!repository.existsByWorkspaceIdAndConnectorKey(workspaceId, connectorKey)) {
            throw new ResourceNotFoundException("Serveur MCP non connecté : " + connectorKey);
        }
        repository.deleteByWorkspaceIdAndConnectorKey(workspaceId, connectorKey);
        invalidate(workspaceId);
    }

    // -------------------------------------------------------------------------

    private String writeJson(Map<String, String> value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            return "{}";
        }
    }

    /** Le propriétaire du workspace a-t-il un plan couvrant les intégrations (BUSINESS+) ? */
    private boolean entitled(String slug) {
        PlanType plan = workspaceRepository.findOwnerPlanBySlug(slug).orElse(PlanType.FREE);
        return planFeatureService.has(plan, PlanFeature.INTEGRATIONS);
    }

    private List<AgentTool> discover(Long workspaceId) {
        List<AgentTool> tools = new ArrayList<>();
        for (ConnectorConnection conn : repository.findByWorkspaceId(workspaceId)) {
            McpClient.ServerRef ref = toServerRef(conn);
            if (ref == null) continue;
            Set<String> allow = allowList(conn);
            try {
                McpClient.Session session = client.initialize(ref);
                try {
                    for (McpClient.ToolDef def : client.listTools(session)) {
                        // Allow-list optionnelle : si définie, on n'expose que les outils autorisés.
                        if (!allow.isEmpty() && !allow.contains(def.name())) continue;
                        tools.add(new ExternalMcpTool(client, ref, def, objectMapper));
                    }
                } finally {
                    client.close(session);
                }
            } catch (Exception e) {
                log.warn("Serveur MCP '{}' (ws={}) ignoré : {}", ref.connectorKey(), workspaceId, e.getMessage());
            }
        }
        if (!tools.isEmpty()) {
            log.debug("Workspace {} : {} outil(s) MCP externe(s) découvert(s)", workspaceId, tools.size());
        }
        return tools;
    }

    /**
     * Statut de chaque serveur MCP connecté sur le workspace (joignabilité + outils exposés, après
     * allow-list). Fait un probe {@code initialize}+{@code tools/list} par serveur — pour l'UI de
     * gestion des connexions. Remonte l'erreur par serveur sans échouer globalement.
     */
    public List<McpServerStatus> serverStatuses(Long workspaceId) {
        List<McpServerStatus> out = new ArrayList<>();
        for (ConnectorConnection conn : repository.findByWorkspaceId(workspaceId)) {
            McpClient.ServerRef ref = toServerRef(conn);
            if (ref == null) continue;
            Set<String> allow = allowList(conn);
            try {
                McpClient.Session session = client.initialize(ref);
                try {
                    List<String> names = client.listTools(session).stream()
                        .map(McpClient.ToolDef::name)
                        .filter(n -> allow.isEmpty() || allow.contains(n))
                        .toList();
                    out.add(new McpServerStatus(ref.connectorKey(), ref.serverUrl(), true, names, null));
                } finally {
                    client.close(session);
                }
            } catch (Exception e) {
                out.add(new McpServerStatus(ref.connectorKey(), ref.serverUrl(), false, List.of(), e.getMessage()));
            }
        }
        return out;
    }

    /** Allow-list (noms d'outils d'origine) d'un connecteur, depuis {@code mcpAllow} (CSV). Vide = tous. */
    private Set<String> allowList(ConnectorConnection conn) {
        String csv = readConfig(conn.getConfig()).getOrDefault(CONFIG_ALLOW, "");
        if (csv.isBlank()) return Set.of();
        Set<String> set = new java.util.HashSet<>();
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
        if (url.isEmpty()) return null;
        String token = config.getOrDefault(CONFIG_TOKEN, "").trim();
        return new McpClient.ServerRef(conn.getConnectorKey(), url, token.isEmpty() ? null : token);
    }

    private Map<String, String> readConfig(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, String>>() {});
        } catch (Exception ex) {
            return Map.of();
        }
    }
}
