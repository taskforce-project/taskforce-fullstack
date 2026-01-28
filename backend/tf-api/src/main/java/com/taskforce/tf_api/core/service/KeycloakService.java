package com.taskforce.tf_api.core.service;

import lombok.extern.slf4j.Slf4j;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.KeycloakBuilder;
import org.keycloak.admin.client.resource.RealmResource;
import org.keycloak.admin.client.resource.UserResource;
import org.keycloak.admin.client.resource.UsersResource;
import org.keycloak.representations.idm.CredentialRepresentation;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.ws.rs.core.Response;
import java.util.Collections;
import java.util.List;

/**
 * Service pour communiquer avec Keycloak
 * L'API Java gère toutes les interactions avec Keycloak, pas le frontend
 */
@Service
@Slf4j
public class KeycloakService {

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
    public String createUser(String email, String password, String firstName, String lastName) {
        log.info("Création d'un utilisateur Keycloak : {}", email);

        UserRepresentation user = new UserRepresentation();
        user.setEmail(email);
        user.setUsername(email); // Utiliser l'email comme username
        user.setFirstName(firstName);
        user.setLastName(lastName);
        user.setEnabled(true);
        user.setEmailVerified(false); // L'email sera vérifié après validation OTP

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
            throw new RuntimeException("Erreur lors de la création de l'utilisateur : " + error);
        }
    }

    /**
     * Vérifie l'email d'un utilisateur dans Keycloak
     */
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
    public UserRepresentation getUserById(String keycloakId) {
        log.info("Récupération de l'utilisateur Keycloak : {}", keycloakId);
        return realmResource.users().get(keycloakId).toRepresentation();
    }

    /**
     * Récupère un utilisateur Keycloak par son email
     */
    public UserRepresentation getUserByEmail(String email) {
        log.info("Recherche de l'utilisateur Keycloak par email : {}", email);
        List<UserRepresentation> users = realmResource.users().search(email, true);

        if (users.isEmpty()) {
            throw new RuntimeException("Utilisateur non trouvé : " + email);
        }

        return users.get(0);
    }

    /**
     * Vérifie si un email existe déjà dans Keycloak
     */
    public boolean emailExists(String email) {
        log.info("Vérification de l'existence de l'email dans Keycloak : {}", email);
        List<UserRepresentation> users = realmResource.users().search(email, true);
        return !users.isEmpty();
    }

    /**
     * Met à jour le mot de passe d'un utilisateur
     */
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
    public void setUserEnabled(String keycloakId, boolean enabled) {
        log.info("Modification du statut de l'utilisateur {} : {}", keycloakId, enabled);

        UserResource userResource = realmResource.users().get(keycloakId);
        UserRepresentation user = userResource.toRepresentation();
        user.setEnabled(enabled);
        userResource.update(user);

        log.info("Statut utilisateur modifié avec succès");
    }

    /**
     * Supprime un utilisateur de Keycloak
     */
    public void deleteUser(String keycloakId) {
        log.info("Suppression de l'utilisateur Keycloak : {}", keycloakId);
        realmResource.users().get(keycloakId).remove();
        log.info("Utilisateur supprimé avec succès");
    }
}
