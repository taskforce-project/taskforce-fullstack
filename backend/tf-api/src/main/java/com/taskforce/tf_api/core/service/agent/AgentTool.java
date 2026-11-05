package com.taskforce.tf_api.core.service.agent;

import java.util.Map;

/**
 * Outil appelable par l'agent (tool calling). Chaque outil expose un nom, une description et un
 * schéma de paramètres (JSON Schema, format OpenAI/Groq), et sait s'exécuter dans un contexte
 * workspace déjà autorisé. Le LLM choisit l'outil ; le backend l'exécute.
 */
public interface AgentTool {

    /** Identifiant unique (snake_case), repris dans la définition envoyée au LLM. */
    String name();

    /** Description courte — c'est ce que lit le LLM pour décider d'appeler l'outil. */
    String description();

    /** Schéma JSON des paramètres (type=object, properties, required). */
    Map<String, Object> parametersSchema();

    /**
     * Exécute l'outil. {@code args} = arguments fournis par le LLM ; renvoie un résultat textuel
     * (réinjecté dans la conversation). Doit rester sûr : l'autorisation workspace est déjà faite.
     */
    String execute(Map<String, Object> args, AgentContext ctx);

    /**
     * L'action que fait l'outil, dans les mots du contrat des règles ({@code contracts/rules}), quand il la porte
     * lui-même : un geste du MCP TaskForce (ADR-024). Null par défaut : {@link CortexGate} la cherche dans sa table.
     */
    default String action() {
        return null;
    }

    /**
     * Pour un outil dont Cortex prépare l'action au lieu de la faire (une carte que la personne relit) : ce qui manque
     * pour la préparer et que seule la personne peut dire, à lui demander d'abord, ou la carte, avec les arguments tels
     * que le serveur les entend. Rien n'est écrit. Défaut : rien ne manque, la carte montre ce que Cortex a écrit.
     */
    default Prepared prepare(Map<String, Object> args, AgentContext ctx) {
        return Prepared.card(args);
    }

    /**
     * Une action préparée, avant la carte : la question à poser d'abord, ou les arguments que la carte montre. La carte
     * reprend ce que le serveur a résolu, pas les mots de Cortex : « moi » y devient la personne qui demande (rejeu de la
     * 1.8.0, 02/11/2026), sinon la carte lisait « moi » parmi les membres et laissait l'issue sans assigné.
     */
    record Prepared(String question, Map<String, Object> args) {
        public static Prepared card(Map<String, Object> args) {
            return new Prepared(null, args);
        }

        public static Prepared ask(String question) {
            return new Prepared(question, null);
        }

        public boolean asks() {
            return question != null;
        }
    }
}
