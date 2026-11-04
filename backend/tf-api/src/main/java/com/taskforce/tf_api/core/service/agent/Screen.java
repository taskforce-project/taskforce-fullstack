package com.taskforce.tf_api.core.service.agent;

/**
 * Ce que la personne voit quand elle écrit à Cortex (R114, séance n°17) : le projet ouvert et l'issue ouverte, tels que
 * le front les lit dans la route et la fiche ouverte. Ce ne sont que des ids : ce qu'ils montrent se relit avec les
 * droits de la personne ({@link ScreenContext}), et un id qu'elle ne voit pas ne montre rien.
 */
public record Screen(Long projectId, Long issueId) {

    /** Rien à l'écran qui compte : un tableau de bord, les réglages, ou une demande venue d'ailleurs (MCP). */
    public static final Screen NONE = new Screen(null, null);

    /** Une issue s'ouvre toujours dans son projet : sans projet, l'issue seule ne se lit pas. */
    public Screen {
        if (projectId == null) issueId = null;
    }

    public boolean isEmpty() {
        return projectId == null;
    }
}
