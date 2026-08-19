package com.taskforce.tf_api.shared.config;

import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

/**
 * Configuration CORS (Cross-Origin Resource Sharing)
 * Permet au frontend d'accéder à l'API
 */
@Configuration
public class CorsConfig {

    /**
     * Origines autorisées, lues depuis {@code cors.allowed-origins} (CSV). PC-027 : la liste était
     * codée en dur (localhost + {@code *.taskforce.com}) et <b>aucun</b> code ne lisait
     * {@code cors.allowed-origins} → {@code CORS_ALLOWED_ORIGINS} (application-prod.yml,
     * docker-compose.prod.yml, render.yaml) était de la <b>config morte</b>, et tout front déployé
     * hors {@code *.taskforce.com} voyait ses appels bloqués par le navigateur. Défaut = origines de
     * développement usuelles (surchargées par le profil / l'env).
     */
    @Value("${cors.allowed-origins:http://localhost:3000,http://localhost:5173,http://localhost:4200}")
    private List<String> allowedOrigins;

    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();

        // Autoriser les credentials (cookies, auth headers...)
        config.setAllowCredentials(true);

        // Origines autorisées (frontend), lues depuis la configuration (cf. champ `allowedOrigins`).
        // `setAllowedOriginPatterns` (et non `setAllowedOrigins`) pour accepter les motifs à joker que
        // la prod peut fournir (ex. https://*.taskforce.com) via CORS_ALLOWED_ORIGINS.
        config.setAllowedOriginPatterns(allowedOrigins);

        // Headers autorisés
        config.setAllowedHeaders(Arrays.asList(
                "Origin",
                "Content-Type",
                "Accept",
                "Authorization",
                "Access-Control-Request-Method",
                "Access-Control-Request-Headers",
                "Accept-Language"
        ));

        // Méthodes HTTP autorisées
        config.setAllowedMethods(Arrays.asList(
                "GET",
                "POST",
                "PUT",
                "PATCH",
                "DELETE",
                "OPTIONS"
        ));

        // Headers exposés au client.
        // Retry-After / X-RateLimit-Remaining : sans exposition explicite, le navigateur les masque
        // au JS en cross-origin — le front recevrait un 429 sans savoir combien de temps patienter.
        config.setExposedHeaders(Arrays.asList(
                "Authorization",
                "Content-Disposition",
                "Retry-After",
                "X-RateLimit-Remaining"
        ));

        // Durée de cache de la config CORS (1 heure)
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        // Utilise /** car avec context-path=/api, les URLs internes sont /auth/register (sans /api)
        source.registerCorsConfiguration("/**", config);

        return new CorsFilter(source);
    }
}

