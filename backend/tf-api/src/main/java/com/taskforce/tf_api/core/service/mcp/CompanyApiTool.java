package com.taskforce.tf_api.core.service.mcp;

import java.util.Map;
import java.util.function.Function;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.ConnectionScope;
import com.taskforce.tf_api.core.enums.ToolClass;
import com.taskforce.tf_api.core.service.agent.AgentContext;

/**
 * Un outil d'un éditeur que TaskForce sert lui-même, par l'API de cet éditeur (Google Drive, Microsoft Graph) au lieu d'un
 * serveur MCP. Pour le reste, c'est un outil de l'entreprise comme un autre ({@link ExternalMcpTool}) : son nom
 * {@code <connecteur>__<outil>}, sa classe donnée par le préréglage, sa connexion (celle de la personne, ou celle de
 * l'espace), le moteur de règles qui le juge (R157), et ce qu'il rend qui compte comme un contenu du dehors (R158).
 */
public class CompanyApiTool extends ExternalMcpTool {

    private final Function<Map<String, Object>, String> run;

    public CompanyApiTool(String connectorKey, String apiBase, McpClient.ToolDef def, ObjectMapper objectMapper,
                          ToolClass toolClass, ConnectionScope scope, Function<Map<String, Object>, String> run) {
        super(null, new McpClient.ServerRef(connectorKey, apiBase, null), def, objectMapper, toolClass, scope);
        this.run = run;
    }

    @Override
    public String execute(Map<String, Object> args, AgentContext ctx) {
        return run.apply(args == null ? Map.of() : args);
    }
}
