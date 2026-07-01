package com.taskforce.tf_api.shared.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.env.Environment;
import org.springframework.security.oauth2.jwt.Jwt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires (sécurité, priorité critique) — {@link JwtIdentityResolver}.
 * Résolution de l'identité depuis le JWT : claim `email` exigé hors profil dev ;
 * repli sur preferred_username / subject en dev.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("JwtIdentityResolver")
class JwtIdentityResolverTest {

    @Mock private Environment environment;
    @InjectMocks private JwtIdentityResolver resolver;

    private Jwt jwt(java.util.Map<String, Object> claims) {
        Jwt.Builder b = Jwt.withTokenValue("t").header("alg", "none").subject("subj");
        claims.forEach(b::claim);
        return b.build();
    }

    @Test
    @DisplayName("hors dev : renvoie le claim email quand présent")
    void should_return_email_claim_in_prod() {
        when(environment.getActiveProfiles()).thenReturn(new String[]{"test"});

        String email = resolver.resolveEmail(jwt(java.util.Map.of("email", "user@ex.dev")));

        assertThat(email).isEqualTo("user@ex.dev");
    }

    @Test
    @DisplayName("hors dev : lève IllegalStateException si le claim email est absent")
    void should_throw_when_email_missing_in_prod() {
        when(environment.getActiveProfiles()).thenReturn(new String[]{"test"});

        assertThatThrownBy(() -> resolver.resolveEmail(jwt(java.util.Map.of("foo", "bar"))))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("dev : repli sur preferred_username quand pas d'email")
    void should_fallback_in_dev() {
        when(environment.getActiveProfiles()).thenReturn(new String[]{"dev"});

        String email = resolver.resolveEmail(jwt(java.util.Map.of("preferred_username", "devuser")));

        assertThat(email).isEqualTo("devuser");
    }
}
