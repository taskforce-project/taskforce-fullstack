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

import com.taskforce.tf_api.core.dto.response.RunnerTokenResponse;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerSettings;
import com.taskforce.tf_api.core.service.delivery.RunnerIdentity;
import com.taskforce.tf_api.core.service.delivery.RunnerIdentityResolver;
import com.taskforce.tf_api.core.service.delivery.RunnerTokenIssuer.InvalidRunnerCredentialsException;

@DisplayName("DesktopRunnerTokens — jetons du runner lancé par l'app desktop")
class DesktopRunnerTokensTest {

    private static final String SECRET = "tfs_" + "s".repeat(40);

    private final LocalRunnerSettings settings =
        new LocalRunnerSettings(true, "delivery-runner", "tf-runner-", "tf_runner_owner", 120, 10, 15);
    private final DesktopProperties properties = new DesktopProperties("tfd_" + "b".repeat(40), "C:/data",
        new DesktopProperties.Account("kc-sub-1", "ada@example.com", "Ada", "Trial"));
    private final DesktopRunnerTokens tokens = new DesktopRunnerTokens(properties, settings, SECRET);

    @Test
    @DisplayName("le runner de la coque reçoit un jeton tfr_ d'une heure")
    void issues_a_token_to_the_shell_runner() {
        RunnerTokenResponse response = tokens.issue("tf-runner-desktop", SECRET);

        assertThat(response.accessToken()).startsWith(DesktopRunnerTokens.TOKEN_PREFIX).hasSizeGreaterThan(40);
        assertThat(response.expiresIn()).isEqualTo(DesktopRunnerTokens.TOKEN_TTL_SECONDS);
        assertThat(tokens.issue("tf-runner-desktop", SECRET).accessToken()).isNotEqualTo(response.accessToken());
    }

    @ParameterizedTest(name = "client {0}, secret {1}")
    @CsvSource(nullValues = "NULL", value = {
        "tf-runner-u7, tfs_ssssssssssssssssssssssssssssssssssssssss",
        "tf-runner-desktop, tfs_wrong",
        "tf-runner-desktop, NULL",
        "NULL, tfs_ssssssssssssssssssssssssssssssssssssssss",
    })
    @DisplayName("tout autre client ou secret est refusé, sans dire pourquoi")
    void refuses_other_credentials(String clientId, String secret) {
        assertThatThrownBy(() -> tokens.issue(clientId, secret))
            .isInstanceOf(InvalidRunnerCredentialsException.class)
            .hasMessage("Invalid runner credentials");
    }

    @Test
    @DisplayName("sans secret de la coque, aucun jeton n'est émis")
    void refuses_everything_without_a_shell_secret() {
        DesktopRunnerTokens unset = new DesktopRunnerTokens(properties, settings, "");

        assertThatThrownBy(() -> unset.issue("tf-runner-desktop", ""))
            .isInstanceOf(InvalidRunnerCredentialsException.class);
    }

    @Test
    @DisplayName("le jeton porte l'identité d'un runner du compte connecté, lue comme sur le serveur")
    void token_carries_the_runner_identity_of_the_signed_in_account() {
        String token = tokens.issue("tf-runner-desktop", SECRET).accessToken();

        Authentication authentication = tokens.authenticate(token);

        assertThat(authentication).isInstanceOf(JwtAuthenticationToken.class);
        Jwt jwt = ((JwtAuthenticationToken) authentication).getToken();
        assertThat(jwt.getTokenValue()).doesNotContain(token);
        assertThat(jwt.hasClaim("email")).isFalse();
        RunnerIdentity identity = new RunnerIdentityResolver(settings).resolve(jwt);
        assertThat(identity.clientId()).isEqualTo("tf-runner-desktop");
        assertThat(identity.ownerEmail()).isEqualTo("ada@example.com");
    }

    @Test
    @DisplayName("un jeton jamais émis est refusé")
    void unknown_token_is_rejected() {
        assertThatThrownBy(() -> tokens.authenticate(DesktopRunnerTokens.TOKEN_PREFIX + "x".repeat(43)))
            .isInstanceOf(InvalidBearerTokenException.class);
    }

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource({
        "tfr_anything, true",
        "tfd_launch, false",
        "eyJhbGciOiJSUzI1NiJ9.payload.sig, false",
    })
    @DisplayName("ne prend que les jetons tfr_, et n'ouvre pas le temps réel")
    void supports_only_runner_tokens(String token, boolean expected) {
        assertThat(tokens.supports(token)).isEqualTo(expected);
        assertThat(tokens.allowsRealtime()).isFalse();
    }
}
