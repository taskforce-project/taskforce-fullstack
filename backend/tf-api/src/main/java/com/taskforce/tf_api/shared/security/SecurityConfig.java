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
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Value("${jwt.secret:myVerySecretKeyForJWTTokenGenerationThatIsLongEnoughToBeSecure256Bits}")
    private String jwtSecret;

    /**
     * JwtDecoder utilisant HS512 pour valider les tokens custom générés par JwtService.
     * Remplace le décodeur auto-configuré par Spring (qui cible les tokens RS256 de Keycloak).
     */
    @Bean
    @ConditionalOnProperty(name = "keycloak.enabled", havingValue = "true", matchIfMissing = true)
    public JwtDecoder jwtDecoder() {
        byte[] keyBytes = jwtSecret.getBytes(StandardCharsets.UTF_8);
        SecretKeySpec keySpec = new SecretKeySpec(keyBytes, "HmacSHA512");
        return NimbusJwtDecoder.withSecretKey(keySpec)
                .macAlgorithm(MacAlgorithm.HS512)
                .build();
    }

    // Endpoints publics partagés entre les deux configurations
    private static final String[] PUBLIC_MATCHERS = {
        "/api/auth/**",
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
     */
    @Bean
    @Order(2)
    @ConditionalOnProperty(name = "keycloak.enabled", havingValue = "true", matchIfMissing = true)
    public SecurityFilterChain protectedEndpointsFilterChain(HttpSecurity http) throws Exception {
        applySecurityHeaders(http);
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

