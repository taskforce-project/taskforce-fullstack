package com.taskforce.tf_api.shared.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

/**
 * Configure le décodeur JWT pour Spring Security.
 *
 * Le backend émet ses propres tokens signés en HS512 (via JwtService).
 * Spring Security doit valider ces tokens avec la même clé secrète,
 * et NON pas via le JWKS Keycloak (RS256).
 *
 * Actif uniquement quand keycloak.enabled=true (sinon la filter chain
 * est en permitAll et ce décodeur n'est pas utilisé).
 */
@Configuration
@ConditionalOnProperty(name = "keycloak.enabled", havingValue = "true", matchIfMissing = true)
public class JwtDecoderConfig {

    @Value("${jwt.secret:myVerySecretKeyForJWTTokenGenerationThatIsLongEnough}")
    private String jwtSecret;

    /**
     * Fournit un JwtDecoder HS512 basé sur la clé secrète du backend.
     * Spring Security l'utilisera automatiquement dans oauth2ResourceServer.
     */
    @Bean
    public JwtDecoder jwtDecoder() {
        SecretKey key = new SecretKeySpec(jwtSecret.getBytes(), "HmacSHA512");
        return NimbusJwtDecoder.withSecretKey(key)
                .macAlgorithm(MacAlgorithm.HS512)
                .build();
    }
}
