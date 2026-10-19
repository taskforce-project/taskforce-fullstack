package com.taskforce.tf_api.core.desktop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

@DisplayName("DesktopLaunchTokenAuthenticator — jeton de lancement de l'app desktop")
class DesktopLaunchTokenAuthenticatorTest {

    private static final String TOKEN = "tfd_" + "b".repeat(40);

    private final DesktopLaunchTokenAuthenticator authenticator = new DesktopLaunchTokenAuthenticator(
        new DesktopProperties(TOKEN, "C:/data",
            new DesktopProperties.Account("kc-sub-1", "ada@example.com", "Ada", "Trial")));

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource({
        "tfd_anything, true",
        "tfp_personal, false",
        "eyJhbGciOiJSUzI1NiJ9.payload.sig, false",
    })
    @DisplayName("ne prend que les jetons tfd_")
    void supports(String token, boolean expected) {
        assertThat(authenticator.supports(token)).isEqualTo(expected);
    }

    @Test
    @DisplayName("le bon jeton authentifie le compte connecté, sous la forme d'un JWT")
    void authenticates_the_signed_in_account() {
        Authentication authentication = authenticator.authenticate(TOKEN);

        assertThat(authentication).isInstanceOf(JwtAuthenticationToken.class);
        Jwt jwt = ((JwtAuthenticationToken) authentication).getToken();
        assertThat(jwt.getSubject()).isEqualTo("kc-sub-1");
        assertThat(jwt.getClaimAsString("email")).isEqualTo("ada@example.com");
        assertThat(jwt.getClaimAsString("preferred_username")).isEqualTo("ada@example.com");
        assertThat(jwt.getClaimAsString("given_name")).isEqualTo("Ada");
        assertThat(jwt.getClaimAsString("family_name")).isEqualTo("Trial");
        assertThat(jwt.getClaimAsString("name")).isEqualTo("Ada Trial");
        assertThat(jwt.getClaimAsBoolean(DesktopLaunchTokenAuthenticator.DESKTOP_CLAIM)).isTrue();
        assertThat(jwt.getTokenValue()).doesNotContain(TOKEN);
        assertThat(authentication.getName()).isEqualTo("ada@example.com");
    }

    @Test
    @DisplayName("un autre jeton est refusé")
    void wrong_token_is_rejected() {
        assertThatThrownBy(() -> authenticator.authenticate("tfd_" + "c".repeat(40)))
            .isInstanceOf(InvalidBearerTokenException.class);
    }

    @Test
    @DisplayName("ouvre aussi le temps réel de la fenêtre")
    void allows_realtime() {
        assertThat(authenticator.allowsRealtime()).isTrue();
    }

    @Test
    @DisplayName("sans prénom ni nom, pas de claims vides")
    void no_empty_name_claims() {
        DesktopLaunchTokenAuthenticator anonymous = new DesktopLaunchTokenAuthenticator(
            new DesktopProperties(TOKEN, "C:/data", new DesktopProperties.Account("kc-sub-2", "bob@example.com", null, "")));

        Jwt jwt = ((JwtAuthenticationToken) anonymous.authenticate(TOKEN)).getToken();

        assertThat(jwt.hasClaim("given_name")).isFalse();
        assertThat(jwt.hasClaim("family_name")).isFalse();
        assertThat(jwt.getClaimAsString("name")).isEqualTo("bob");
    }
}
