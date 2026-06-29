package com.taskforce.tf_api.core.service.agent;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

/** Registre des outils agentiques (collecte tous les {@link AgentTool} déclarés en beans). */
@Component
public class AgentToolRegistry {

    private final Map<String, AgentTool> byName = new LinkedHashMap<>();

    public AgentToolRegistry(List<AgentTool> tools) {
        for (AgentTool t : tools) byName.put(t.name(), t);
    }

    public Collection<AgentTool> all() { return byName.values(); }

    public AgentTool get(String name) { return byName.get(name); }

    /** Définitions au format OpenAI/Groq (`type:function`) pour le tool-calling. */
    public List<Map<String, Object>> toolDefinitions() {
        return all().stream().map(t -> Map.<String, Object>of(
            "type", "function",
            "function", Map.of(
                "name", t.name(),
                "description", t.description(),
                "parameters", t.parametersSchema()
            )
        )).toList();
    }
}
