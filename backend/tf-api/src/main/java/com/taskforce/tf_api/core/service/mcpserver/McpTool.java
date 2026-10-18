package com.taskforce.tf_api.core.service.mcpserver;

import java.util.function.Function;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Un outil du serveur MCP de l'instance (OSS-5.2).
 *
 * <p>Chaque outil déclare son <b>équivalent REST</b> ({@link #method()} et {@link #path()}, relatif au workspace) :
 * c'est lui que la portée d'une session déléguée juge ({@code DeliverySessionScope}), exactement comme si l'agent
 * appelait l'API. Un outil n'ouvre donc rien que la route correspondante n'ouvrirait pas.</p>
 *
 * @param name        nom vu par le client ({@code mcp__taskforce__<name>} dans Claude Code)
 * @param title       libellé court
 * @param description ce que fait l'outil, pour le modèle
 * @param inputSchema schéma JSON des arguments
 * @param readOnly    l'outil n'écrit rien (annotation {@code readOnlyHint})
 * @param method      méthode HTTP de l'équivalent REST
 * @param path        chemin de l'équivalent REST sous {@code /api/workspaces/{slug}/}, d'après les arguments
 * @param handler     exécution, au nom de la personne
 */
public record McpTool(
    String name,
    String title,
    String description,
    ObjectNode inputSchema,
    boolean readOnly,
    String method,
    Function<JsonNode, String> path,
    Handler handler
) {

    /** Exécute l'outil au nom de {@code userId} dans le workspace {@code slug} ; le résultat est sérialisé en JSON. */
    @FunctionalInterface
    public interface Handler {
        Object call(String slug, Long userId, JsonNode args);
    }
}
