package com.taskforce.tf_api.core.service;

import org.keycloak.representations.idm.UserRepresentation;

/**
 * Annuaire des comptes TaskForce : identité, nom, mot de passe et état des comptes, tenus par Keycloak.
 *
 * <p>Deux implémentations : {@link KeycloakAdminService} (webapp et auto-hébergement, API d'administration de
 * Keycloak) et, dans l'app desktop, l'annuaire du seul compte connecté, qui ne joint jamais Keycloak
 * ({@code com.taskforce.tf_api.core.desktop.DesktopAccountDirectory}). Le nom de l'interface reste celui de
 * l'ancienne classe pour ne pas toucher à ses appelants.</p>
 */
public interface KeycloakService {

    /** Crée un compte ; rend son identifiant Keycloak. */
    String createUser(String email, String password, String firstName, String lastName);

    /** Marque l'adresse du compte comme vérifiée. */
    void verifyEmail(String keycloakId);

    /** Compte par identifiant Keycloak. */
    UserRepresentation getUserById(String keycloakId);

    /**
     * Compte par adresse e-mail.
     *
     * @throws RuntimeException aucun compte n'a cette adresse
     */
    UserRepresentation getUserByEmail(String email);

    /** Vrai si un compte a cette adresse. */
    boolean emailExists(String email);

    /** Remplace le mot de passe du compte. */
    void updatePassword(String keycloakId, String newPassword);

    /** Active ou désactive le compte. */
    void setUserEnabled(String keycloakId, boolean enabled);

    /** Change le prénom et/ou le nom ; un champ {@code null} reste inchangé. */
    void updateUserNames(String keycloakId, String firstName, String lastName);

    /** Supprime le compte. */
    void deleteUser(String keycloakId);

    /** Ferme toutes les sessions du compte. */
    void logoutUser(String keycloakId);

    /**
     * Vrai si le compte a enregistré une application d'authentification sur le compte en ligne : la connexion
     * demande alors son code, sur toutes les voies (webapp, app desktop, GitHub et Google).
     */
    boolean hasOneTimeCode(String keycloakId);
}
