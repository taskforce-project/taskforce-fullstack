package com.taskforce.tf_api.core.dto.response;

import java.util.List;

import com.taskforce.tf_api.core.enums.ConnectorAuthType;
import com.taskforce.tf_api.core.enums.ConnectorCategory;
import com.taskforce.tf_api.core.enums.ConnectorStatus;

/**
 * Descripteur déclaratif d'un outil du catalogue d'intégrations — la « fiche » d'un connecteur.
 *
 * <p>Source unique de vérité pour un outil : sa catégorie, son mode d'auth, les champs à saisir,
 * ce qu'il sait faire ({@code capabilities}, ex. {@code observe} = alimente le Brain OS), et s'il est
 * déjà implémenté ({@code status}). Un nouvel outil = une entrée ici (+ un connecteur quand on l'implémente).
 */
public record ConnectorDescriptor(
    String key,                    // slug stable : "plane", "github", "stripe"…
    String name,                   // nom affiché
    ConnectorCategory category,
    ConnectorAuthType authType,
    ConnectorStatus status,
    List<ConnectorField> fields,   // champs de connexion (vide pour OAuth / PLANNED)
    List<String> capabilities,     // "observe" (→ Brain OS), "act", "metrics"…
    String docsUrl,
    String description,
    /** Aide affichée en tooltip : où/comment récupérer la clé quand ce n'est pas du 1-clic OAuth. */
    String setupHint,
    /** Site officiel du service (homepage) — lien affiché dans la fiche détaillée. Null si inconnu. */
    String websiteUrl,
    /** URL d'un serveur MCP DISTANT hébergé (officiel) pour cet outil, pré-remplie (éditable) dans le
     *  dialog Connect → « MCP-ready » 1-clic. Null si l'outil n'expose pas d'endpoint MCP hébergé. */
    String mcpSuggestedUrl
) {}
