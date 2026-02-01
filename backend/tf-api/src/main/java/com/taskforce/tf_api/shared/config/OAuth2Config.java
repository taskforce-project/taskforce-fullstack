package com.taskforce.tf_api.shared.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

/**
 * Configuration OAuth2/OpenID Connect pour Keycloak
 *
 * Strategy: Resource Owner Password Credentials Grant
 * - Permet l'authentification avec un formulaire custom (pas de redirection vers Keycloak)
 * - Le frontend envoie email/password à l'API Java
 * - L'API Java authentifie via Keycloak Token Endpoint
 * - Retourne des JWT tokens au frontend
 */
@Configuration
public class OAuth2Config {

    @Value("${keycloak.url}")
    private String keycloakUrl;

    @Value("${keycloak.realm}")
    private String realm;

    @Value("${keycloak.client-id}")
    private String clientId;

    @Value("${keycloak.client-secret}")
    private String clientSecret;

    /**
     * RestTemplate configuré pour les appels Keycloak
     * Timeout: 5 secondes
     */
    @Bean(name = "keycloakRestTemplate")
    public RestTemplate keycloakRestTemplate() {
        RestTemplate restTemplate = new RestTemplate();
        restTemplate.setRequestFactory(clientHttpRequestFactory());
        return restTemplate;
    }

    /**
     * Configuration des timeouts pour les requêtes Keycloak
     */
    private ClientHttpRequestFactory clientHttpRequestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000); // 5 secondes
        factory.setReadTimeout(5000);    // 5 secondes
        return factory;
    }

    /**
     * URL du Token Endpoint Keycloak
     */
    @Bean
    public String keycloakTokenEndpoint() {
        return keycloakUrl + "/realms/" + realm + "/protocol/openid-connect/token";
    }

    /**
     * URL du Logout Endpoint Keycloak
     */
    @Bean
    public String keycloakLogoutEndpoint() {
        return keycloakUrl + "/realms/" + realm + "/protocol/openid-connect/logout";
    }

    /**
     * URL du Userinfo Endpoint Keycloak
     */
    @Bean
    public String keycloakUserinfoEndpoint() {
        return keycloakUrl + "/realms/" + realm + "/protocol/openid-connect/userinfo";
    }

    /**
     * URL du Token Introspection Endpoint Keycloak
     */
    @Bean
    public String keycloakIntrospectEndpoint() {
        return keycloakUrl + "/realms/" + realm + "/protocol/openid-connect/token/introspect";
    }
}
