package com.taskforce.tf_api.core.dto.response;

import java.util.List;

import com.taskforce.tf_api.core.enums.ConnectorAuthType;
import com.taskforce.tf_api.core.enums.ConnectorCategory;

/**
 * Fiche d'un outil du catalogue d'intégrations : intégration native ou préréglage de serveur MCP.
 */
public record ConnectorDescriptor(
    String key,                    // slug stable : "plane", "github", "linear"…
    String name,                   // nom affiché
    ConnectorCategory category,
    ConnectorAuthType authType,
    List<ConnectorField> fields,   // champs du formulaire de connexion (Plane seulement)
    List<String> capabilities,     // "observe" (lecture native), "act" (actions natives), "mcp"
    String docsUrl,
    String description,
    /** Où et comment récupérer la clé, quand la connexion n'est pas en un clic. */
    String setupHint,
    /** Site officiel du service, affiché dans la fiche détaillée. */
    String websiteUrl,
    /** URL du serveur MCP hébergé officiel, préremplie (modifiable) dans le dialogue de connexion. */
    String mcpSuggestedUrl
) {}
