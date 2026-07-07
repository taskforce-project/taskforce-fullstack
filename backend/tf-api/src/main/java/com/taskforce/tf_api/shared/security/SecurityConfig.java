package com.taskforce.tf_api.shared.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Value("${keycloak.url:http://localhost:8080}")
    private String keycloakUrl;

    @Value("${keycloak.realm:taskforce}")
    private String keycloakRealm;

    /**
     * JwtDecoder RS256 adossé au JWK Set de Keycloak : valide les access tokens <b>émis par
     * Keycloak</b> (clé asymétrique, rotation gérée par l'IdP) au lieu des anciens tokens HS512
     * auto-émis (clé symétrique — dette PC-019 / TF-SEC-009, supprimée).
     *
     * <p>La signature est vérifiée via les clés publiques exposées sur {@code /protocol/openid-connect/certs},
     * et l'{@code issuer} est validé (défense contre un token signé par un autre realm/IdP).</p>
     */
    @Bean
    @ConditionalOnProperty(name = "keycloak.enabled", havingValue = "true", matchIfMissing = true)
    public JwtDecoder jwtDecoder() {
        String issuer = keycloakUrl + "/realms/" + keycloakRealm;
        String jwkSetUri = issuer + "/protocol/openid-connect/certs";

        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwkSetUri).build();
        OAuth2TokenValidator<Jwt> withIssuer = JwtValidators.createDefaultWithIssuer(issuer);
        decoder.setJwtValidator(withIssuer);
        return decoder;
    }

    // Endpoints publics partagés entre les deux configurations
    private static final String[] PUBLIC_MATCHERS = {
        "/api/auth/**",
        "/api/files/brain/**",
        "/api/sales/**",
        "/api/stripe/**",
        "/actuator/**",
        "/swagger-ui/**",
        "/v3/api-docs/**",
        "/api-docs/**",
        "/ws/**",
        "/ws-sockjs/**",
        "/api/integrations/github/callback",
        "/api/integrations/slack/callback"
    };

    // CSP stricte pour une API REST (pas de HTML servi — aucune ressource active autorisée)
    private static final String API_CSP =
        "default-src 'none'; frame-ancestors 'none'; form-action 'none'";

    private static void applySecurityHeaders(HttpSecurity http) throws Exception {
        http.headers(headers -> headers
            .httpStrictTransportSecurity(hsts -> hsts
                .includeSubDomains(true)
                .maxAgeInSeconds(31_536_000)
                .preload(true)
            )
            .frameOptions(frame -> frame.deny())
            .contentTypeOptions(Customizer.withDefaults())
            .referrerPolicy(referrer -> referrer
                .policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN)
            )
            .contentSecurityPolicy(csp -> csp.policyDirectives(API_CSP))
            .permissionsPolicy(permissions -> permissions
                .policy("camera=(), microphone=(), geolocation=(), payment=(), usb=(), screen-wake-lock=()")
            )
        );
    }

    /**
     * Configuration de sécurité SANS OAuth2/Keycloak (dev local).
     */
    @Bean
    @ConditionalOnProperty(name = "keycloak.enabled", havingValue = "false")
    public SecurityFilterChain securityFilterChainWithoutOAuth(HttpSecurity http) throws Exception {
        applySecurityHeaders(http);
        http
            .cors(Customizer.withDefaults())
            .authorizeHttpRequests(authz -> authz.anyRequest().permitAll())
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));

        return http.build();
    }

    /**
     * Filter chain prioritaire pour les endpoints publics.
     */
    @Bean
    @Order(1)
    @ConditionalOnProperty(name = "keycloak.enabled", havingValue = "true", matchIfMissing = true)
    public SecurityFilterChain publicEndpointsFilterChain(HttpSecurity http) throws Exception {
        applySecurityHeaders(http);
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
     * Le JwtDecoder HS512 est injecté explicitement pour éviter que Spring
     * n'utilise le décodeur RS256 auto-configuré depuis l'issuer Keycloak.
     */
    @Bean
    @Order(2)
    @ConditionalOnProperty(name = "keycloak.enabled", havingValue = "true", matchIfMissing = true)
    public SecurityFilterChain protectedEndpointsFilterChain(HttpSecurity http) throws Exception {
        applySecurityHeaders(http);
        http
            .cors(Customizer.withDefaults())
            .authorizeHttpRequests(authz -> authz.anyRequest().authenticated())
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> jwt.decoder(jwtDecoder())))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));

        return http.build();
    }
}

