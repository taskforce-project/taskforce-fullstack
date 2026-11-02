package com.taskforce.tf_api.core.service.agent;

/**
 * Contexte d'exécution d'un outil agentique (déjà autorisé), et ce que la personne voit à l'écran quand elle écrit
 * (R114) : un geste qui doit demander quelle issue propose d'abord celles de l'écran.
 */
public record AgentContext(String slug, Long workspaceId, Long userId, Screen screen) {

    public AgentContext {
        if (screen == null) screen = Screen.NONE;
    }

    /** Une demande sans écran : le serveur MCP, la banque d'évaluations, une action accordée. */
    public AgentContext(String slug, Long workspaceId, Long userId) {
        this(slug, workspaceId, userId, Screen.NONE);
    }
}
