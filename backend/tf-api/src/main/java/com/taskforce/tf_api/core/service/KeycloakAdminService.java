package com.taskforce.tf_api.core.service;

import java.util.Collections;
import java.util.List;

import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.KeycloakBuilder;
import org.keycloak.admin.client.resource.RealmResource;
import org.keycloak.admin.client.resource.UserResource;
import org.keycloak.admin.client.resource.UsersResource;
import org.keycloak.representations.idm.CredentialRepresentation;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.ws.rs.core.Response;
import lombok.extern.slf4j.Slf4j;

/**
 * Annuaire des comptes adossé à l'API d'administration de Keycloak (webapp et auto-hébergement).
 * L'API Java gère toutes les interactions avec Keycloak, pas le frontend. L'app desktop, qui ne joint jamais
 * Keycloak, a sa propre implémentation ({@code DesktopAccountDirectory}).
 */
@Service
@Profile("!desktop")
@Slf4j
public class KeycloakAdminService implements KeycloakService {

    @Value("${keycloak.url}")
    private String serverUrl;

    @Value("${keycloak.realm}")
    private String realm;

    @Value("${keycloak.admin.username}")
    private String adminUsername;

    @Value("${keycloak.admin.password}")
    private String adminPassword;

    @Value("${keycloak.admin.client-id:admin-cli}")
    private String adminClientId;

    private Keycloak keycloak;
    private RealmResource realmResource;

    @PostConstruct
    public void init() {
        keycloak = KeycloakBuilder.builder()
            .serverUrl(serverUrl)
            .realm("master") // Connexion admin sur le realm master
            .username(adminUsername)
            .password(adminPassword)
            .clientId(adminClientId)
            .build();

        realmResource = keycloak.realm(realm);
        log.info("Keycloak admin client initialisé avec succès pour le realm : {}", realm);
    }

    /**
     * Crée un utilisateur dans Keycloak
     * Retourne l'ID Keycloak de l'utilisateur créé
     */
    @Override
    public String createUser(String email, String password, String firstName, String lastName) {
        log.info("Création d'un utilisateur Keycloak");

        UserRepresentation user = new UserRepresentation();
        user.setEmail(email);
        user.setUsername(email);
        user.setFirstName(firstName);
        user.setLastName(lastName);
        user.setEnabled(true);
        user.setEmailVerified(false);

        // Créer les credentials (mot de passe)
        CredentialRepresentation credential = new CredentialRepresentation();
        credential.setType(CredentialRepresentation.PASSWORD);
        credential.setValue(password);
        credential.setTemporary(false);
        user.setCredentials(Collections.singletonList(credential));

        // Créer l'utilisateur
        UsersResource usersResource = realmResource.users();
        Response response = usersResource.create(user);

        if (response.getStatus() == 201) {
            // Récupérer l'ID de l'utilisateur créé
            String locationHeader = response.getHeaderString("Location");
            String userId = locationHeader.substring(locationHeader.lastIndexOf('/') + 1);
            log.info("Utilisateur Keycloak créé avec succès. ID : {}", userId);
            response.close();
            return userId;
        } else {
            String error = response.readEntity(String.class);
            response.close();
            log.error("Erreur lors de la création de l'utilisateur Keycloak : {}", error);
            throw new RuntimeException("Error creating the user: " + error);
        }
    }

    /**
     * Vérifie l'email d'un utilisateur dans Keycloak
     */
    @Override
    public void verifyEmail(String keycloakId) {
        log.info("Vérification de l'email pour l'utilisateur Keycloak : {}", keycloakId);

        UserResource userResource = realmResource.users().get(keycloakId);
        UserRepresentation user = userResource.toRepresentation();
        user.setEmailVerified(true);
        userResource.update(user);

        log.info("Email vérifié avec succès pour l'utilisateur : {}", keycloakId);
    }

    /**
     * Récupère un utilisateur Keycloak par son ID
     */
    @Override
    public UserRepresentation getUserById(String keycloakId) {
        log.info("Récupération de l'utilisateur Keycloak : {}", keycloakId);
        return realmResource.users().get(keycloakId).toRepresentation();
    }

    /**
     * Récupère un utilisateur Keycloak par son email
     */
    @Override
    public UserRepresentation getUserByEmail(String email) {
        log.debug("Recherche d'un utilisateur Keycloak par e-mail");
        List<UserRepresentation> users = realmResource.users().search(email, true);

        if (users.isEmpty()) {
            throw new RuntimeException("User not found: " + email);
        }

        return users.get(0);
    }

    /** Type d'identifiant d'une application d'authentification dans Keycloak. */
    private static final String OTP_CREDENTIAL = "otp";

    @Override
    public boolean hasOneTimeCode(String keycloakId) {
        return realmResource.users().get(keycloakId).credentials().stream()
            .anyMatch(credential -> OTP_CREDENTIAL.equals(credential.getType()));
    }

    /**
     * Vérifie si un email existe déjà dans Keycloak
     */
    @Override
    public boolean emailExists(String email) {
        log.debug("Vérification d'une adresse e-mail dans Keycloak");
        List<UserRepresentation> users = realmResource.users().search(email, true);
        return !users.isEmpty();
    }

    /**
     * Met à jour le mot de passe d'un utilisateur
     */
    @Override
    public void updatePassword(String keycloakId, String newPassword) {
        log.info("Mise à jour du mot de passe pour l'utilisateur : {}", keycloakId);

        CredentialRepresentation credential = new CredentialRepresentation();
        credential.setType(CredentialRepresentation.PASSWORD);
        credential.setValue(newPassword);
        credential.setTemporary(false);

        UserResource userResource = realmResource.users().get(keycloakId);
        userResource.resetPassword(credential);

        log.info("Mot de passe mis à jour avec succès");
    }

    /**
     * Active ou désactive un utilisateur
     */
    @Override
    public void setUserEnabled(String keycloakId, boolean enabled) {
        log.info("Modification du statut de l'utilisateur {} : {}", keycloakId, enabled);

        UserResource userResource = realmResource.users().get(keycloakId);
        UserRepresentation user = userResource.toRepresentation();
        user.setEnabled(enabled);
        userResource.update(user);

        log.info("Statut utilisateur modifié avec succès");
    }

    /**
     * Met à jour le prénom et/ou le nom d'un utilisateur dans Keycloak.
     * Seuls les champs non-null sont appliqués.
     */
    @Override
    public void updateUserNames(String keycloakId, String firstName, String lastName) {
        log.info("Mise à jour des noms pour l'utilisateur Keycloak : {}", keycloakId);

        UserResource userResource = realmResource.users().get(keycloakId);
        UserRepresentation user = userResource.toRepresentation();

        if (firstName != null) user.setFirstName(firstName);
        if (lastName != null)  user.setLastName(lastName);

        userResource.update(user);
        log.info("Noms mis à jour avec succès pour keycloakId={}", keycloakId);
    }

    /**
     * Supprime un utilisateur de Keycloak
     */
    @Override
    public void deleteUser(String keycloakId) {
        log.info("Suppression de l'utilisateur Keycloak : {}", keycloakId);
        realmResource.users().get(keycloakId).remove();
        log.info("Utilisateur supprimé avec succès");
    }

    /**
     * Déconnecte l'utilisateur de <b>toutes</b> ses sessions Keycloak (invalide access + refresh
     * tokens côté IdP). Équivalent OIDC natif de l'ancienne « révocation de tous les tokens ».
     */
    @Override
    public void logoutUser(String keycloakId) {
        log.info("Déconnexion de toutes les sessions Keycloak pour : {}", keycloakId);
        realmResource.users().get(keycloakId).logout();
        log.info("Sessions Keycloak invalidées pour : {}", keycloakId);
    }
}
