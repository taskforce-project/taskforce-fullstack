package com.taskforce.tf_api.core.dto.response;

import java.util.List;

/**
 * Le catalogue d'intégrations d'un workspace : le « pool » d'outils groupé par catégorie, avec pour
 * chaque outil son statut de connexion. Pilote l'UI générique des intégrations (pas d'écran par outil).
 */
public record IntegrationCatalogResponse(
    int total,
    int available,
    int connected,
    List<CategoryGroup> categories
) {
    public record CategoryGroup(String category, String label, List<ConnectorView> tools) {}

    /** Un outil du catalogue enrichi de l'état de connexion du workspace courant. */
    public record ConnectorView(
        String key,
        String name,
        String category,
        String authType,
        String status,       // AVAILABLE | PLANNED
        boolean connected,
        List<ConnectorField> fields,
        List<String> capabilities,
        String description,
        String docsUrl,
        String setupHint,
        String websiteUrl,
        /** URL d'un serveur MCP distant hébergé, pré-remplie (éditable) dans le dialog Connect. Null sinon. */
        String mcpSuggestedUrl
    ) {}
}
