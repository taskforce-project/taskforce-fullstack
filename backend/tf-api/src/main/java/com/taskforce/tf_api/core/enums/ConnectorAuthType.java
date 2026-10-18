package com.taskforce.tf_api.core.enums;

/**
 * Mode de connexion d'un outil du catalogue d'intégrations.
 *
 * <ul>
 *   <li>{@code OAUTH2} : redirection vers le fournisseur, rien à saisir (GitHub, Slack).</li>
 *   <li>{@code API_KEY} : une clé à coller (Plane).</li>
 *   <li>{@code MCP} : le serveur MCP de l'outil, par OAuth en un clic, jeton ou en-tête (préréglages et serveurs
 *       personnalisés, ADR-020).</li>
 * </ul>
 */
public enum ConnectorAuthType {
    OAUTH2,
    API_KEY,
    MCP
}
