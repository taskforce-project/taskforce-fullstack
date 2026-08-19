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
}
