package com.taskforce.tf_api.shared.config;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.KeycloakBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration Keycloak Admin Client
 * Permet de gérer les utilisateurs programmatiquement (création, modification, envoi d'emails, etc.)
 */
@Slf4j
@Getter
@Configuration
public class KeycloakConfig {

    @Value("${keycloak.url}")
    private String serverUrl;

    @Value("${keycloak.realm}")
    private String realm;

    @Value("${keycloak.client-id}")
    private String clientId;

    @Value("${keycloak.client-secret}")
    private String clientSecret;

    @Value("${keycloak.admin.username}")
    private String adminUsername;

    @Value("${keycloak.admin.password}")
    private String adminPassword;

    /**
     * Bean Keycloak Admin Client
     * Utilisé pour administrer Keycloak (création d'utilisateurs, envoi d'emails, etc.)
     */
    @Bean
    public Keycloak keycloakAdminClient() {
        log.info("Initializing Keycloak Admin Client - Server: {}, Realm: {}", serverUrl, realm);

        return KeycloakBuilder.builder()
                .serverUrl(serverUrl)
                .realm("master") // On se connecte au realm master pour administrer
                .clientId("admin-cli") // Client par défaut pour l'admin
                .username(adminUsername)
                .password(adminPassword)
                .build();
    }
}
