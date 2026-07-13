package com.taskforce.tf_api.core.service.mcp;

import java.util.Map;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;

/**
 * {@link AgentTool} qui <b>relaie vers un outil d'un serveur MCP externe</b> (Linear & co). Instancié
 * dynamiquement par {@link WorkspaceMcpService} pour chaque outil découvert via {@code tools/list} —
 * ce n'est pas un bean Spring (il dépend du workspace courant et de sa configuration de connecteur).
 *
 * <p>Le nom exposé au LLM est <b>namespacé</b> {@code <connecteur>__<outil>} pour éviter toute
 * collision avec les outils internes (ex. {@code search_brain}). À l'exécution, on rouvre une session
 * MCP, on appelle l'outil par son nom d'origine, puis on referme (isolation par appel).
 */
public class ExternalMcpTool implements AgentTool {

    private static final int MAX_NAME_LEN = 64; // limite de nom d'outil (format OpenAI/Groq)

    private final McpClient client;
    private final McpClient.ServerRef server;
    private final McpClient.ToolDef def;
    private final ObjectMapper objectMapper;
    private final String namespacedName;

    public ExternalMcpTool(McpClient client, McpClient.ServerRef server,
                           McpClient.ToolDef def, ObjectMapper objectMapper) {
        this.client = client;
        this.server = server;
        this.def = def;
        this.objectMapper = objectMapper;
        this.namespacedName = buildName(server.connectorKey(), def.name());
    }

    /** {@code <connecteur>__<outil>}, assaini au charset des noms d'outils et borné à 64 caractères. */
    static String buildName(String connectorKey, String toolName) {
        String base = (connectorKey + "__" + toolName).replaceAll("[^a-zA-Z0-9_-]", "_");
        return base.length() <= MAX_NAME_LEN ? base : base.substring(0, MAX_NAME_LEN);
    }

    @Override
    public String name() {
        return namespacedName;
    }

    /** Outil de lecture seule (annotation MCP {@code readOnlyHint}) ? Sinon = écriture → confirmation. */
    public boolean isReadOnly() {
        return def.readOnly();
    }

    @Override
    public String description() {
        String d = def.description() != null ? def.description() : "";
        return "[via " + server.connectorKey() + "] " + d;
    }

    @Override
    public Map<String, Object> parametersSchema() {
        JsonNode schema = def.inputSchema();
        if (schema == null || schema.isNull() || !schema.isObject()) {
            return Map.of("type", "object", "properties", Map.of());
        }
        return objectMapper.convertValue(schema, new TypeReference<Map<String, Object>>() {});
    }

    @Override
    public String execute(Map<String, Object> args, AgentContext ctx) {
        McpClient.Session session = client.initialize(server);
        try {
            return client.callTool(session, def.name(), args);
        } finally {
            client.close(session);
        }
    }
}
