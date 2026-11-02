package com.taskforce.tf_api.core.service.mcpserver;

import java.util.List;
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
 * @param action      l'action que fait l'outil, dans les mots du contrat des règles ({@code contracts/rules}) : c'est
 *                    elle que la table juge quand Cortex s'en sert (ADR-024) ; null pour un outil qu'aucune règle ne
 *                    couvre, donc demandé
 * @param method      méthode HTTP de l'équivalent REST
 * @param path        chemin de l'équivalent REST sous {@code /api/workspaces/{slug}/}, d'après les arguments
 * @param handler     exécution, au nom de la personne
 * @param needs       ce que le geste exige, et son défaut sûr quand il en a un (R115) : ce qui manque sans défaut sûr,
 *                    TaskForce le demande à la personne ; vide pour une lecture qui n'a besoin de rien
 */
public record McpTool(
    String name,
    String title,
    String description,
    ObjectNode inputSchema,
    boolean readOnly,
    String action,
    String method,
    Function<JsonNode, String> path,
    Handler handler,
    List<Need> needs
) {

    public McpTool {
        needs = needs == null ? List.of() : List.copyOf(needs);
    }

    /** Un outil qui ne déclare rien de ce qu'il exige : une lecture, ou un outil que Cortex n'appelle pas. */
    public McpTool(String name, String title, String description, ObjectNode inputSchema, boolean readOnly, String action,
                   String method, Function<JsonNode, String> path, Handler handler) {
        this(name, title, description, inputSchema, readOnly, action, method, path, handler, List.of());
    }

    /** Le même outil, qui déclare ce qu'il exige (R115). */
    public McpTool needing(Need... declared) {
        return new McpTool(name, title, description, inputSchema, readOnly, action, method, path, handler, List.of(declared));
    }

    /** Exécute l'outil au nom de {@code userId} dans le workspace {@code slug} ; le résultat est sérialisé en JSON. */
    @FunctionalInterface
    public interface Handler {
        Object call(String slug, Long userId, JsonNode args);
    }

    /**
     * Ce qu'un geste exige (R115, séance n°17) : un argument, la question que TaskForce pose quand il manque, et la
     * valeur par défaut sûre quand elle existe. Un argument qui a un défaut sûr ne se demande pas (Jobs : une question
     * posée alors qu'un défaut sûr existe est un échec de conception), sauf devant une action qui ne se défait pas : le
     * défaut y vient alors en premier. {@code when} dit la condition d'un besoin que le geste juge lui-même (« a code
     * project ») ; sans elle, le besoin vaut toujours, et Cortex le vérifie avant le geste.
     *
     * @param field       l'argument
     * @param question    la question posée quand il manque ; null pour un argument qui ne se demande jamais
     * @param safeDefault le défaut sûr, dans les mots de l'interface ; null quand il n'y en a pas
     * @param when        la condition d'un besoin conditionnel, jugée par le geste ; null pour un besoin de toujours
     */
    public record Need(String field, String question, String safeDefault, String when) {

        /** Exigé, sans défaut sûr : TaskForce le demande quand il manque. */
        public static Need asked(String field, String question) {
            return new Need(field, question, null, null);
        }

        /** Exigé seulement dans un cas que le geste juge : demandé alors, son défaut sûr en premier s'il en a un. */
        public static Need askedWhen(String field, String question, String safeDefault, String when) {
            return new Need(field, question, safeDefault, when);
        }

        /** Un défaut sûr : jamais demandé. */
        public static Need byDefault(String field, String safeDefault) {
            return new Need(field, null, safeDefault, null);
        }

        /** Vrai quand TaskForce le demande s'il manque. */
        public boolean isAsked() {
            return question != null;
        }
    }
}
