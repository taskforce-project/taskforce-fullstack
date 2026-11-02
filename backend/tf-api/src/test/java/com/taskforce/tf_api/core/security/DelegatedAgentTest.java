package com.taskforce.tf_api.core.security;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * L'agent d'une session déléguée, lu sur le principal que pose {@link DeliverySessionFilter} : l'activité d'une issue dit
 * par qui est passée une action faite au nom de la personne.
 */
@DisplayName("DelegatedAgent")
class DelegatedAgentTest {

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private static JwtAuthenticationToken token(Jwt.Builder claims) {
        return new JwtAuthenticationToken(claims.build(), List.of(), "pierre@acme.dev");
    }

    private static Jwt.Builder person() {
        return Jwt.withTokenValue("t").header("alg", "none").claim("email", "pierre@acme.dev");
    }

    @ParameterizedTest(name = "agent [{0}] -> {1}")
    @CsvSource(value = {
        "Claude Code     | Claude Code",
        "'  Claude Code '| Claude Code",
        "''              | Agent",   // un nom vide garde la trace d'un agent, sans en inventer un
        "NULL            | Agent",   // un principal délégué sans le nom de son agent
    }, delimiter = '|', nullValues = "NULL")
    void reads_the_agent_of_a_delegated_session(String agent, String expected) {
        Jwt.Builder claims = person().claim(DeliverySessionFilter.RUN_CLAIM, 100L);
        if (agent != null) claims.claim(DeliverySessionFilter.AGENT_CLAIM, agent);
        SecurityContextHolder.getContext().setAuthentication(token(claims));

        assertThat(DelegatedAgent.current()).contains(expected);
    }

    @Test
    @DisplayName("la personne elle-même : aucun agent, même si un nom d'agent traîne dans son jeton")
    void a_person_has_no_agent() {
        SecurityContextHolder.getContext().setAuthentication(token(person().claim(DeliverySessionFilter.AGENT_CLAIM, "X")));

        assertThat(DelegatedAgent.current()).isEmpty();
    }

    @Test
    @DisplayName("sans authentification, ou une autre que par jeton : aucun agent")
    void no_jwt_no_agent() {
        assertThat(DelegatedAgent.current()).isEmpty();

        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("pierre", "x"));

        assertThat(DelegatedAgent.current()).isEmpty();
    }

    @Test
    @DisplayName("un geste de Cortex dans la conversation : « Cortex » pendant le geste seulement, même imbriqué")
    void cortex_acts_for_the_person_during_its_gesture() {
        SecurityContextHolder.getContext().setAuthentication(token(person()));

        String inside = DelegatedAgent.actingAs("Cortex", () -> {
            String nested = DelegatedAgent.actingAs("Other", () -> DelegatedAgent.current().orElseThrow());
            return nested + "/" + DelegatedAgent.current().orElseThrow();
        });

        assertThat(inside).isEqualTo("Other/Cortex");
        assertThat(DelegatedAgent.current()).isEmpty();
    }

    @Test
    @DisplayName("un geste qui échoue ne laisse pas « Cortex » sur le fil")
    void a_failed_gesture_leaves_nothing_behind() {
        try {
            DelegatedAgent.actingAs("Cortex", () -> { throw new IllegalStateException("boom"); });
        } catch (IllegalStateException expected) {
            // l'échec remonte tel quel
        }

        assertThat(DelegatedAgent.current()).isEmpty();
    }
}
