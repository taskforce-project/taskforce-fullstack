package com.taskforce.tf_api.core.enums;

/**
 * Mode d'authentification d'un connecteur — pilote le formulaire de connexion côté UI.
 *
 * <ul>
 *   <li>{@code OAUTH2} : flux d'autorisation (redirection) — ex. GitHub, Slack, Google.</li>
 *   <li>{@code API_KEY} : une clé unique — ex. Plane, Stripe, Resend.</li>
 *   <li>{@code TOKEN} : un token personnel — ex. Vercel, Figma, Notion (internal).</li>
 *   <li>{@code CONFIG} : plusieurs champs — ex. AWS (key/secret/region), SMTP, Keycloak.</li>
 *   <li>{@code NONE} : sans secret (webhook entrant, etc.).</li>
 * </ul>
 */
public enum ConnectorAuthType {
    OAUTH2,
    API_KEY,
    TOKEN,
    CONFIG,
    NONE
}
