package com.taskforce.tf_api.core.service.delivery;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.security.oauth2.jwt.Jwt;

import com.taskforce.tf_api.shared.exception.ForbiddenException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Identité d'un runner local (ADR-013) : quatre preuves signées par Keycloak, toutes requises.
 */
@DisplayName("RunnerIdentityResolver")
class RunnerIdentityResolverTest {

    private final RunnerIdentityResolver resolver = new RunnerIdentityResolver(
        new LocalRunnerSettings(true, "delivery-runner", "tf-runner-", "tf_runner_owner", 120, 10, 15));

    /** Jeton de compte de service complet ; chaque test en retire ou en fausse une preuve. */
    private static Jwt.Builder runnerToken() {
        return Jwt.withTokenValue("t").header("alg", "RS256")
            .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(300))
            .claim("azp", "tf-runner-pierre")
            .claim("preferred_username", "service-account-tf-runner-pierre")
            .claim("realm_access", Map.of("roles", List.of("default-roles", "delivery-runner")))
            .claim("tf_runner_owner", "Pierre@TaskForce.dev ");
    }

    @Test
    @DisplayName("jeton complet : identité résolue, propriétaire normalisé en minuscules")
    void resolves_complete_token() {
        RunnerIdentity identity = resolver.resolve(runnerToken().build());

        assertThat(identity.clientId()).isEqualTo("tf-runner-pierre");
        assertThat(identity.ownerEmail()).isEqualTo("pierre@taskforce.dev");
    }

    @Test
    @DisplayName("azp absent : repli sur le claim client_id")
    void falls_back_to_client_id_claim() {
        Jwt jwt = runnerToken().claims(c -> c.remove("azp")).claim("client_id", "tf-runner-pierre").build();

        assertThat(resolver.resolve(jwt).clientId()).isEqualTo("tf-runner-pierre");
    }

    static Stream<Arguments> incompleteTokens() {
        return Stream.of(
            Arguments.of("sans le rôle delivery-runner",
                runnerToken().claim("realm_access", Map.of("roles", List.of("user"))).build()),
            Arguments.of("sans realm_access",
                runnerToken().claims(c -> c.remove("realm_access")).build()),
            Arguments.of("client hors préfixe",
                runnerToken().claim("azp", "taskforce-api")
                    .claim("preferred_username", "service-account-taskforce-api").build()),
            Arguments.of("sujet qui n'est pas le compte de service du client (une personne avec le rôle)",
                runnerToken().claim("preferred_username", "pierre@taskforce.dev").build()),
            Arguments.of("compte de service d'un AUTRE client",
                runnerToken().claim("preferred_username", "service-account-tf-runner-mallory").build()),
            Arguments.of("sans propriétaire",
                runnerToken().claims(c -> c.remove("tf_runner_owner")).build()),
            Arguments.of("propriétaire vide",
                runnerToken().claim("tf_runner_owner", "  ").build()),
            Arguments.of("identifiant de client démesuré",
                runnerToken().claim("azp", "tf-runner-" + "x".repeat(120))
                    .claim("preferred_username", "service-account-tf-runner-" + "x".repeat(120)).build())
        );
    }

    @ParameterizedTest(name = "refusé : {0}")
    @MethodSource("incompleteTokens")
    void rejects_incomplete_token(String label, Jwt jwt) {
        assertThatThrownBy(() -> resolver.resolve(jwt)).isInstanceOf(ForbiddenException.class);
    }

    @Test
    @DisplayName("looksLikeRunner : une seule preuve suffit (fail-closed), un jeton d'utilisateur n'en porte aucune")
    void looks_like_runner_is_deliberately_broad() {
        Jwt user = Jwt.withTokenValue("u").header("alg", "RS256")
            .claim("azp", "taskforce-api").claim("email", "dev@taskforce.dev")
            .claim("realm_access", Map.of("roles", List.of("user"))).build();
        Jwt onlyPrefix = Jwt.withTokenValue("p").header("alg", "RS256").claim("azp", "tf-runner-x").build();
        Jwt onlyOwner = Jwt.withTokenValue("o").header("alg", "RS256").claim("tf_runner_owner", "a@b.c").build();

        assertThat(resolver.looksLikeRunner(user)).isFalse();
        assertThat(resolver.looksLikeRunner(onlyPrefix)).isTrue();
        assertThat(resolver.looksLikeRunner(onlyOwner)).isTrue();
        assertThat(resolver.looksLikeRunner(runnerToken().build())).isTrue();
    }
}
