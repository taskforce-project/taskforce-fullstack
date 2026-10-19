package com.taskforce.tf_api.shared.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.security.oauth2.jwt.Jwt;

@DisplayName("AuthorizedPartyValidator : seuls les jetons obtenus par TaskForce passent")
class AuthorizedPartyValidatorTest {

    private final AuthorizedPartyValidator validator = new AuthorizedPartyValidator("taskforce-api", "tf-runner-");

    private static Jwt token(String claim, String client) {
        Jwt.Builder builder = Jwt.withTokenValue("t").header("alg", "RS256").subject("kc-sub-1")
            .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60));
        if (client != null) {
            builder.claims(claims -> claims.putAll(Map.of(claim, client)));
        } else {
            builder.claim("scope", "openid");
        }
        return builder.build();
    }

    @ParameterizedTest(name = "{0} = {1} -> {2}")
    @CsvSource(nullValues = "NULL", value = {
        "azp, taskforce-api, true",
        "azp, tf-runner-pierre, true",
        "azp, tf-runner-u29, true",
        "client_id, tf-runner-desktop, true",
        "azp, taskforce-web, false",
        "azp, taskforce-desktop, false",
        "azp, account-console, false",
        "azp, tf-runner-, false",
        "azp, taskforce-api-other, false",
        "azp, NULL, false",
    })
    @DisplayName("le client qui a obtenu le jeton décide")
    void accepts_only_our_clients(String claim, String client, boolean accepted) {
        assertThat(validator.validate(token(claim, client)).hasErrors()).isEqualTo(!accepted);
    }

    @ParameterizedTest(name = "backend = \"{0}\"")
    @CsvSource(nullValues = "NULL", value = {"''", "NULL"})
    @DisplayName("sans client du backend configuré, ses jetons ne passent pas par défaut")
    void no_backend_client_configured(String backendClient) {
        AuthorizedPartyValidator unconfigured = new AuthorizedPartyValidator(backendClient, "tf-runner-");

        assertThat(unconfigured.validate(token("azp", "taskforce-api")).hasErrors()).isTrue();
        assertThat(unconfigured.validate(token("azp", "tf-runner-pierre")).hasErrors()).isFalse();
    }
}
