package com.taskforce.tf_api.core.service.agent;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

/**
 * Registre des outils agentiques (collecte tous les {@link AgentTool} déclarés en beans).
 *
 * <p>Les variantes {@code (…, extra)} permettent d'ajouter, <b>par requête</b>, des outils dynamiques
 * — typiquement les outils de serveurs <b>MCP externes</b> propres au workspace courant — sans état
 * global mutable. Les outils internes (beans) restent prioritaires en cas de collision de nom.
 */
@Component
public class AgentToolRegistry {

    private final Map<String, AgentTool> byName = new LinkedHashMap<>();

    public AgentToolRegistry(List<AgentTool> tools) {
        for (AgentTool t : tools) byName.put(t.name(), t);
    }

    public Collection<AgentTool> all() { return byName.values(); }

    public AgentTool get(String name) { return byName.get(name); }

    /** Résout un outil parmi les internes puis les {@code extra} (outils externes de la requête). */
    public AgentTool get(String name, List<AgentTool> extra) {
        AgentTool internal = byName.get(name);
        if (internal != null) return internal;
        if (extra != null) {
            for (AgentTool t : extra) if (t.name().equals(name)) return t;
        }
        return null;
    }

    /** Définitions au format OpenAI/Groq (`type:function`) pour le tool-calling. */
    public List<Map<String, Object>> toolDefinitions() {
        return toolDefinitions(List.of());
    }

    /** Définitions des outils internes + {@code extra} (outils externes découverts pour la requête). */
    public List<Map<String, Object>> toolDefinitions(List<AgentTool> extra) {
        List<AgentTool> merged = new ArrayList<>(all());
        if (extra != null) merged.addAll(extra);
        return merged.stream().map(t -> Map.<String, Object>of(
            "type", "function",
            "function", Map.of(
                "name", t.name(),
                "description", t.description(),
                "parameters", t.parametersSchema()
            )
        )).toList();
    }
}
