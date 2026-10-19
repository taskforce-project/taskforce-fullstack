package com.taskforce.tf_api.shared.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

/**
 * Clients HTTP partagés : le RestTemplate des appels Keycloak (connexion par mot de passe, ROPC), le
 * RestTemplate générique des intégrations tierces et l'ObjectMapper de l'application.
 */
@Configuration
public class OAuth2Config {

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
     * RestTemplate générique pour les intégrations tierces (GitHub, Slack, Webhooks)
     * Timeout: 10 secondes
     */
    @Bean
    @org.springframework.context.annotation.Primary
    public RestTemplate restTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10000);
        factory.setReadTimeout(10000);
        RestTemplate restTemplate = new RestTemplate();
        restTemplate.setRequestFactory(factory);
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
     * ObjectMapper partagé pour la sérialisation/désérialisation JSON
     */
    @Bean
    @org.springframework.context.annotation.Primary
    public ObjectMapper objectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return mapper;
    }
}
