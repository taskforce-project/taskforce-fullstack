package com.taskforce.tf_api.shared.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    // Endpoints publics partagés entre les deux configurations
    private static final String[] PUBLIC_MATCHERS = {
        "/api/auth/**",
        "/api/sales/**",
        "/api/stripe/**",
        "/actuator/**",
        "/swagger-ui/**",
        "/v3/api-docs/**"
    };

    /**
     * Configuration de sécurité SANS OAuth2/Keycloak
     * Utilisé uniquement quand keycloak.enabled=false
     */
    @Bean
    @ConditionalOnProperty(name = "keycloak.enabled", havingValue = "false")
    public SecurityFilterChain securityFilterChainWithoutOAuth(HttpSecurity http) throws Exception {
        http
            .cors(Customizer.withDefaults())
            .authorizeHttpRequests(authz -> authz.anyRequest().permitAll())
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));

        return http.build();
    }

    /**
     * Filter chain prioritaire pour les endpoints publics.
     * N'applique PAS oauth2ResourceServer : un token expiré/invalide envoyé
     * par erreur ne déclenche pas de 401 sur ces routes.
     */
    @Bean
    @Order(1)
    @ConditionalOnProperty(name = "keycloak.enabled", havingValue = "true", matchIfMissing = true)
    public SecurityFilterChain publicEndpointsFilterChain(HttpSecurity http) throws Exception {
        http
            .securityMatcher(PUBLIC_MATCHERS)
            .cors(Customizer.withDefaults())
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(authz -> authz.anyRequest().permitAll());

        return http.build();
    }

    /**
     * Filter chain pour les endpoints authentifiés.
     * Applique oauth2ResourceServer (validation JWT Keycloak).
     */
    @Bean
    @Order(2)
    @ConditionalOnProperty(name = "keycloak.enabled", havingValue = "true", matchIfMissing = true)
    public SecurityFilterChain protectedEndpointsFilterChain(HttpSecurity http) throws Exception {
        http
            .cors(Customizer.withDefaults())
            .authorizeHttpRequests(authz -> authz.anyRequest().authenticated())
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> {}))
            .oauth2Client(oauth2 -> {})
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));

        return http.build();
    }
}
