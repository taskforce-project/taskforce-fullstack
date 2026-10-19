package com.taskforce.tf_api.shared.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;

/**
 * Point d'extension : authentifie un bearer qui n'est pas un JWT de Keycloak (jeton personnel, OSS-5.1 ; jeton de
 * lancement de l'app desktop). {@link SecurityConfig} essaie ces beans avant le décodeur JWT ; un bean qui ne
 * reconnaît pas la forme du jeton le laisse au décodeur.
 *
 * <p>Existe pour respecter le sens des couches ({@code shared ← core}) : l'implémentation a besoin du domaine
 * (table des jetons) et vit dans {@code core}.</p>
 */
public interface BearerTokenAuthenticator {

    /** Vrai si ce bean prend en charge ce jeton (d'après sa forme, sans lecture en base). */
    boolean supports(String token);

    /**
     * Authentification de la requête, avec un {@code JwtAuthenticationToken} pour que les contrôleurs et les gardes
     * existants lisent le principal comme d'habitude.
     *
     * @throws AuthenticationException jeton inconnu, révoqué ou expiré (réponse 401)
     */
    Authentication authenticate(String token) throws AuthenticationException;

    /**
     * Vrai si ce jeton ouvre aussi le temps réel (connexion STOMP). Faux par défaut : un jeton personnel ne vaut que
     * pour le serveur MCP, il ne doit pas lire les flux d'une fenêtre de l'app.
     */
    default boolean allowsRealtime() {
        return false;
    }
}
