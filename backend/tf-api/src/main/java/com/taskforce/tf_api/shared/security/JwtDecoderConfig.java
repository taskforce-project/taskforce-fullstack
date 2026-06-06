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
 * Décodeur JWT HMAC optionnel (legacy).
 *
 * En mode Keycloak (resource server), Spring doit utiliser le décodeur
 * auto-configuré depuis issuer-uri/jwk-set-uri (RS256). Ce bean ne doit
 * donc pas être actif par défaut pour éviter d'écraser la config Keycloak.
 */
@Configuration
@ConditionalOnProperty(name = "jwt.hmac-decoder.enabled", havingValue = "true")
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
