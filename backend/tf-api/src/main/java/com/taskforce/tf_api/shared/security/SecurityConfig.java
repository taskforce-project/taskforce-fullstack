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

    /** Adresse INTERNE de Keycloak (réseau Docker) — sert à récupérer les clés (JWKS), appel serveur. */
    @Value("${keycloak.url:http://localhost:8080}")
    private String keycloakUrl;

    /**
     * Adresse PUBLIQUE de Keycloak — celle que le navigateur joint, et donc l'{@code issuer} que
     * portent les jetons. Distincte de {@link #keycloakUrl}. Repli sur l'interne si non définie, ce
     * qui préserve le comportement des environnements à URL unique (prod derrière un seul domaine).
     */
    @Value("${keycloak.public-url:${keycloak.url:http://localhost:8080}}")
    private String keycloakPublicUrl;

    @Value("${keycloak.realm:taskforce}")
    private String keycloakRealm;

    /**
     * JwtDecoder RS256 adossé au JWK Set de Keycloak : valide les access tokens <b>émis par
     * Keycloak</b> (clé asymétrique, rotation gérée par l'IdP) au lieu des anciens tokens HS512
     * auto-émis (clé symétrique — dette PC-019 / TF-SEC-009, supprimée).
     *
     * <p>La signature est vérifiée via les clés publiques exposées sur {@code /protocol/openid-connect/certs},
     * et l'{@code issuer} est validé (défense contre un token signé par un autre realm/IdP).</p>
     *
     * <p><b>Issuer public, clés internes — le piège interne/public, encore.</b> Depuis que le realm
     * porte un {@code frontendUrl} fixe (URL publique), <b>tous</b> les jetons — connexion classique
     * (ROPC) comme connexion externe (GitHub) — ont {@code iss = URL publique}. L'issuer attendu doit
     * donc être l'URL <b>publique</b>. Les clés, elles, se récupèrent sur l'adresse <b>interne</b> :
     * le backend joint {@code keycloak:8080}, jamais {@code localhost:8180} (qui, dans le conteneur,
     * désigne le conteneur lui-même). Confondre les deux rejetait les jetons du navigateur, ou rendait
     * le JWKS injoignable. Auparavant l'issuer était bâti sur l'URL interne et les jetons ROPC, émis
     * en interne, correspondaient par <b>coïncidence</b> ; le jour où l'issuer est devenu public
     * (nécessaire à la connexion externe), la coïncidence a cessé et toute l'authentification tombait.</p>
     */
    @Bean
    @ConditionalOnProperty(name = "keycloak.enabled", havingValue = "true", matchIfMissing = true)
    public JwtDecoder jwtDecoder() {
        String issuer = keycloakPublicUrl + "/realms/" + keycloakRealm;
        String jwkSetUri = keycloakUrl + "/realms/" + keycloakRealm + "/protocol/openid-connect/certs";

        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwkSetUri).build();
        OAuth2TokenValidator<Jwt> withIssuer = JwtValidators.createDefaultWithIssuer(issuer);
        decoder.setJwtValidator(withIssuer);
        return decoder;
    }

    // Endpoints publics partagés entre les deux configurations
    private static final String[] PUBLIC_MATCHERS = {
        "/api/auth/**",
        // Preview publique d'une invitation : l'invité clique le lien du mail sans être connecté
        // (il n'a parfois pas encore de compte). Un seul segment `*` → seul GET /api/invitations/{token}
        // est public ; POST /api/invitations/{token}/accept (2 segments) reste authentifié (JWT requis). WS-03/04.
        "/api/invitations/*",
        "/api/files/brain/**",
        "/api/sales/**",
        "/api/stripe/**",
        // Webhook Stripe : requête serveur-à-serveur signée (pas de JWT). La signature est
        // vérifiée dans StripeWebhookController via constructEvent. Sans ça : 401 → BILL-03 KO.
        "/api/webhooks/stripe",
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
     * Filter chain PRIORITAIRE pour « mes invitations » (user-centric → JWT obligatoire).
     *
     * <p>{@code GET /api/invitations/mine} n'a qu'<b>un seul segment</b> après {@code /api/invitations/},
     * il matchait donc le motif public {@code /api/invitations/*} (prévu pour la seule preview par token
     * {@code GET /api/invitations/&#123;token&#125;}) → la requête tombait dans la chaîne publique, sans
     * traitement du JWT → {@code @AuthenticationPrincipal Jwt} <b>null</b> → {@code NullPointerException}
     * (500). Cette chaîne {@code @Order(0)} capte {@code /mine} <b>avant</b> la chaîne publique et exige
     * l'authentification, si bien que le JWT du membre connecté est bien décodé.</p>
     */
    @Bean
    @Order(0)
    @ConditionalOnProperty(name = "keycloak.enabled", havingValue = "true", matchIfMissing = true)
    public SecurityFilterChain myInvitationsFilterChain(HttpSecurity http) throws Exception {
        applySecurityHeaders(http);
        http
            .securityMatcher("/api/invitations/mine", "/api/invitations/mine/**")
            .cors(Customizer.withDefaults())
            .authorizeHttpRequests(authz -> authz.anyRequest().authenticated())
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> jwt.decoder(jwtDecoder())))
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

