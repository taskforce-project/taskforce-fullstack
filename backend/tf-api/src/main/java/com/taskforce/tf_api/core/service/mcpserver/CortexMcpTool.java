package com.taskforce.tf_api.core.service.mcpserver;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.security.DelegatedAgent;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.CortexGesture;

/**
 * Un outil du MCP TaskForce tel que Cortex s'en sert dans la conversation (ADR-024) : le même outil qu'un agent
 * extérieur appelle par le serveur MCP, appelé ici dans le processus du backend, au nom de la personne qui écrit (pas
 * d'une session déléguée). {@code AgentService} le juge comme toute action de Cortex, par les règles de l'espace, sur
 * l'action que l'outil porte ; l'activité de l'issue dit « Cortex », pour la personne.
 *
 * <p>Seule la présentation change : Cortex nomme l'issue, la colonne et la personne par leurs noms, comme on les lit sur
 * le tableau ; les ids, qu'un agent délégué connaît déjà, ne lui sont pas montrés.</p>
 */
final class CortexMcpTool implements CortexGesture {

    /** Les arguments par id, que Cortex remplace par des noms : un petit modèle ne les invente pas. */
    private static final Set<String> IDS = Set.of("projectId", "issueId", "statusId", "assigneeId");

    private final McpTool tool;
    private final IssueGestures gestures;
    private final ObjectMapper mapper;

    CortexMcpTool(McpTool tool, IssueGestures gestures, ObjectMapper mapper) {
        this.tool = tool;
        this.gestures = gestures;
        this.mapper = mapper;
    }

    @Override public String name() { return tool.name(); }

    @Override public String description() { return tool.description(); }

    @Override public String action() { return tool.action(); }

    /** Le schéma de l'outil, sans les ids ; l'issue, par sa clé, devient obligatoire. */
    @Override public Map<String, Object> parametersSchema() {
        ObjectNode schema = tool.inputSchema().deepCopy();
        ObjectNode properties = (ObjectNode) schema.path("properties");
        properties.remove(IDS);
        List<String> required = new ArrayList<>();
        if (properties.has("issue")) required.add("issue");
        schema.path("required").forEach(name -> {
            if (!IDS.contains(name.asText()) && !required.contains(name.asText())) required.add(name.asText());
        });
        ArrayNode list = schema.putArray("required");
        required.forEach(list::add);
        return mapper.convertValue(schema, new TypeReference<Map<String, Object>>() {});
    }

    @Override public Done perform(Map<String, Object> args, AgentContext ctx) {
        JsonNode named = mapper.valueToTree(args == null ? Map.of() : args);
        JsonNode resolved = gestures.withIds(ctx.slug(), ctx.userId(), named);
        Object value = DelegatedAgent.actingAs(IssueGestures.CORTEX,
            () -> tool.handler().call(ctx.slug(), ctx.userId(), resolved));
        if (value instanceof IssueGestures.Gesture gesture) {
            return new Done(gesture.summary(), gesture.issue(), gesture.undo());
        }
        return new Done(write(value), null, null);
    }

    @Override public Done preview(Map<String, Object> args, AgentContext ctx) {
        JsonNode resolved = gestures.withIds(ctx.slug(), ctx.userId(), mapper.valueToTree(args == null ? Map.of() : args));
        IssueGestures.Gesture gesture = gestures.preview(tool.name(), ctx.slug(), ctx.userId(), resolved);
        return gesture == null ? null : new Done(gesture.summary(), gesture.issue(), null);
    }

    private String write(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Tool result not serializable", e);
        }
    }
}
