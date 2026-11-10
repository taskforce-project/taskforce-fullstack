package com.taskforce.tf_api.core.service.agent;

/**
 * Contexte d'exécution d'un outil agentique (déjà autorisé), ce que la personne voit à l'écran quand elle écrit (R114),
 * et sa demande telle qu'elle l'a écrite : un geste qui doit demander quelle issue propose d'abord celles de l'écran, et
 * un nom que la demande ne dit pas n'est pas celui de la personne (R115).
 *
 * @param request      la demande de la personne ; null hors d'un tour de Cortex (MCP, banque, réponse à une question)
 * @param project      le projet de la conversation (R135), que ses gestes prennent quand la demande n'en nomme pas ; null
 *                     sans projet, et hors d'un tour
 * @param conversation la conversation de ce tour, null hors d'un tour : la réponse à une carte y garde le projet choisi
 */
public record AgentContext(String slug, Long workspaceId, Long userId, Screen screen, String request, Long project,
                           Long conversation) {

    public AgentContext {
        if (screen == null) screen = Screen.NONE;
    }

    /** Une demande hors d'une conversation qui a un projet. */
    public AgentContext(String slug, Long workspaceId, Long userId, Screen screen, String request) {
        this(slug, workspaceId, userId, screen, request, null, null);
    }

    /** Une demande sans écran : le serveur MCP, la banque d'évaluations, une action accordée. */
    public AgentContext(String slug, Long workspaceId, Long userId) {
        this(slug, workspaceId, userId, Screen.NONE, null);
    }

    /** Un geste qui reprend sur la réponse de la personne : l'écran de sa question, sans demande à relire. */
    public AgentContext(String slug, Long workspaceId, Long userId, Screen screen) {
        this(slug, workspaceId, userId, screen, null);
    }
}
