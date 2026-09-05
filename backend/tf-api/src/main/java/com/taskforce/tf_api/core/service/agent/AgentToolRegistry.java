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

    /** Définitions des outils internes + {@code extra} (outils externes découverts pour la requête).
     *  Les descriptions/schémas sont <b>allégés</b> avant l'envoi au LLM (cf. {@link #trimSchema}) : les
     *  serveurs MCP (Linear…) portent des schémas verbeux qui gonflent le payload (Groq 413) sans aider
     *  le tool-calling. Alléger permet d'en envoyer davantage sous la même limite. */
    public List<Map<String, Object>> toolDefinitions(List<AgentTool> extra) {
        List<AgentTool> merged = new ArrayList<>(all());
        if (extra != null) merged.addAll(extra);
        return merged.stream().map(t -> Map.<String, Object>of(
            "type", "function",
            "function", Map.of(
                "name", t.name(),
                "description", trimText(t.description()),
                "parameters", trimSchema(t.parametersSchema())
            )
        )).toList();
    }

    /** Longueur max d'une `description` envoyée au LLM. Les longues proses des schémas MCP n'améliorent
     *  pas le tool-calling et gonflent le payload. */
    private static final int MAX_DESC = 160;

    private static String trimText(String s) {
        if (s == null) return "";
        s = s.strip();
        return s.length() <= MAX_DESC ? s : s.substring(0, MAX_DESC).stripTrailing() + "…";
    }

    /**
     * Allège récursivement un JSON schema de paramètres : tronque les `description`/`title`, retire les
     * `examples`/`$schema`, borne les `enum` longs. Garde la structure utile (noms, types, required) →
     * réduit fortement le payload des gros serveurs MCP sans casser le tool-calling.
     */
    private static Object trimSchema(Object node) {
        if (node instanceof Map<?, ?> m) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : m.entrySet()) {
                String k = String.valueOf(e.getKey());
                Object v = e.getValue();
                if ("examples".equals(k) || "example".equals(k) || "$schema".equals(k)) continue;
                if ("description".equals(k) || "title".equals(k)) {
                    out.put(k, trimText(String.valueOf(v)));
                } else if ("enum".equals(k) && v instanceof List<?> l && l.size() > 20) {
                    out.put(k, new ArrayList<>(l.subList(0, 20)));
                } else {
                    out.put(k, trimSchema(v));
                }
            }
            return out;
        }
        if (node instanceof List<?> l) {
            List<Object> out = new ArrayList<>(l.size());
            for (Object e : l) out.add(trimSchema(e));
            return out;
        }
        return node;
    }
}
