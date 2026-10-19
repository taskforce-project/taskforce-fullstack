package com.taskforce.tf_api.shared.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.test.util.ReflectionTestUtils;

import io.github.bucket4j.distributed.proxy.ProxyManager;

/**
 * Smoke tests des classes {@code @Configuration} du package shared.
 *
 * <p>Ce sont de purs tests de fabrique de beans : on instancie la config, on
 * injecte les champs {@code @Value} requis par réflexion, puis on appelle
 * chaque méthode {@code @Bean} et on vérifie qu'un bean non nul est construit.
 * Aucun contexte Spring, aucune connexion réseau.
 */
@DisplayName("Configs Spring — smoke beans")
class SharedConfigBeanTest {

    @Test
    @DisplayName("CorsConfig — corsFilter() se construit")
    void corsConfig_corsFilter() {
        CorsConfig cfg = new CorsConfig();
        assertThat(cfg.corsFilter()).isNotNull();
    }

    @Test
    @DisplayName("CorsConfig - le CORS passe avant le rate limiting (sinon un 429 part sans en-têtes CORS)")
    @SuppressWarnings("unchecked")
    void corsConfig_runsBeforeRateLimiting() {
        CorsConfig cors = new CorsConfig();
        var corsRegistration = cors.corsFilterRegistration(cors.corsFilter());
        ObjectProvider<ProxyManager<String>> provider = mock(ObjectProvider.class);
        var rateLimitRegistration = new RateLimitConfig().rateLimitFilter(provider);

        assertThat(corsRegistration.getOrder()).isLessThan(rateLimitRegistration.getOrder());
    }

    @Test
    @DisplayName("OpenApiConfig — customOpenAPI() se construit")
    void openApiConfig_customOpenAPI() {
        OpenApiConfig cfg = new OpenApiConfig();
        assertThat(cfg.customOpenAPI()).isNotNull();
    }

    @Test
    @DisplayName("RateLimitConfig — rateLimitFilter() se construit (mode local, sans ProxyManager Redis)")
    @SuppressWarnings("unchecked")
    void rateLimitConfig_rateLimitFilter() {
        RateLimitConfig cfg = new RateLimitConfig();
        // Aucun ProxyManager disponible → le filtre retombe sur son mode local en mémoire.
        ObjectProvider<ProxyManager<String>> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(null);
        assertThat(cfg.rateLimitFilter(provider)).isNotNull();
    }

    // GroqConfig supprimé le 16/07 (TF-AI-GROQ-CLEANUP) — son test ne vérifiait que la construction
    // de ses beans (RestTemplate + noms de modèles), soit de la cérémonie sur un client cloud bloqué
    // sur ce réseau, jamais appelé, et dont l'absence de capture d'usage désarmait le quota IA.

    @Test
    @DisplayName("MailConfig — javaMailSender() se construit (aucune connexion SMTP)")
    void mailConfig_javaMailSender() {
        MailConfig cfg = new MailConfig();
        ReflectionTestUtils.setField(cfg, "host", "smtp.example.com");
        ReflectionTestUtils.setField(cfg, "port", 587);
        ReflectionTestUtils.setField(cfg, "username", "user");
        ReflectionTestUtils.setField(cfg, "password", "pass");
        ReflectionTestUtils.setField(cfg, "smtpAuth", true);
        ReflectionTestUtils.setField(cfg, "starttlsEnable", true);
        ReflectionTestUtils.setField(cfg, "starttlsRequired", true);
        ReflectionTestUtils.setField(cfg, "debug", false);

        assertThat(cfg.javaMailSender()).isNotNull();
    }

    @Test
    @DisplayName("MinioConfig — minioClient() se construit (builder ne connecte pas)")
    void minioConfig_minioClient() {
        MinioConfig cfg = new MinioConfig();
        ReflectionTestUtils.setField(cfg, "endpoint", "http://localhost:9000");
        ReflectionTestUtils.setField(cfg, "accessKey", "minioadmin");
        ReflectionTestUtils.setField(cfg, "secretKey", "minioadmin");

        assertThat(cfg.minioClient()).isNotNull();
    }

    @Test
    @DisplayName("OAuth2Config — les beans (RestTemplates, ObjectMapper) se construisent")
    void oauth2Config_beans() {
        OAuth2Config cfg = new OAuth2Config();

        assertThat(cfg.keycloakRestTemplate()).isNotNull();
        assertThat(cfg.restTemplate()).isNotNull();
        assertThat(cfg.objectMapper()).isNotNull();
    }

    @Test
    @DisplayName("JpaConfig — s'instancie (aucun @Bean à construire)")
    void jpaConfig_instantiates() {
        assertThat(new JpaConfig()).isNotNull();
    }

    @Test
    @DisplayName("OtpConfig — s'instancie (aucun @Bean à construire)")
    void otpConfig_instantiates() {
        OtpConfig cfg = new OtpConfig();
        ReflectionTestUtils.setField(cfg, "expirationMinutes", 10);
        ReflectionTestUtils.setField(cfg, "length", 6);
        assertThat(cfg).isNotNull();
    }
}
