package com.taskforce.tf_api.core.service.mcp;

import java.util.Map;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.ConnectionScope;
import com.taskforce.tf_api.core.enums.ToolClass;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;

/**
 * {@link AgentTool} qui <b>relaie vers un outil d'un serveur MCP externe</b> (Linear & co). Instancié
 * dynamiquement par {@link WorkspaceMcpService} pour chaque outil découvert via {@code tools/list}, par la connexion
 * de la personne : ce n'est pas un bean Spring (il dépend de la personne, de son workspace et de sa connexion).
 *
 * <p>Le nom exposé au LLM est <b>namespacé</b> {@code <connecteur>__<outil>} pour éviter toute
 * collision avec les outils internes (ex. {@code search_brain}). À l'exécution, on rouvre une session
 * MCP, on appelle l'outil par son nom d'origine, puis on referme (isolation par appel).</p>
 *
 * <p>Sa classe (lecture ou écriture) est celle que TaskForce lui donne d'après le préréglage du serveur (séance n°22,
 * R158), jamais ce que le serveur déclare ; un outil inconnu est une écriture. {@link #shared()} dit s'il passe par une
 * connexion partagée avec l'espace : une écriture n'y est alors accordée que par un propriétaire ou un administrateur.</p>
 */
public class ExternalMcpTool implements AgentTool {

    private static final int MAX_NAME_LEN = 64; // limite de nom d'outil (format OpenAI/Groq)

    private final McpClient client;
    private final McpClient.ServerRef server;
    private final McpClient.ToolDef def;
    private final ObjectMapper objectMapper;
    private final String namespacedName;
    private final ToolClass toolClass;
    private final ConnectionScope scope;

    public ExternalMcpTool(McpClient client, McpClient.ServerRef server, McpClient.ToolDef def,
                           ObjectMapper objectMapper, ToolClass toolClass, ConnectionScope scope) {
        this.client = client;
        this.server = server;
        this.def = def;
        this.objectMapper = objectMapper;
        this.namespacedName = buildName(server.connectorKey(), def.name());
        this.toolClass = toolClass == null ? ToolClass.WRITE : toolClass;
        this.scope = scope == null ? ConnectionScope.WORKSPACE : scope;
    }

    /** Un outil dont TaskForce ne connaît pas la classe : une écriture, par une connexion d'espace. */
    public ExternalMcpTool(McpClient client, McpClient.ServerRef server, McpClient.ToolDef def,
                           ObjectMapper objectMapper) {
        this(client, server, def, objectMapper, ToolClass.WRITE, ConnectionScope.WORKSPACE);
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

    /** Le nom de l'outil sur son serveur. */
    public String originalName() {
        return def.name();
    }

    /** Outil de lecture, d'après TaskForce (le préréglage) ? Sinon une écriture, qui demande. */
    public boolean isReadOnly() {
        return toolClass.reads();
    }

    public ToolClass toolClass() {
        return toolClass;
    }

    /** L'outil passe-t-il par une connexion partagée avec l'espace ? */
    public boolean shared() {
        return scope == ConnectionScope.WORKSPACE;
    }

    /** Le connecteur qui porte l'outil ({@code linear}…) : le fait {@code server} que jugent les règles. */
    public String connectorKey() {
        return server.connectorKey();
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
