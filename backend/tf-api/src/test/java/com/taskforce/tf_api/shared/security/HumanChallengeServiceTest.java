package com.taskforce.tf_api.shared.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests unitaires — {@link HumanChallengeService}.
 *
 * <p>Tout le mécanisme tient dans une signature et deux bornes de temps. Les tests portent donc sur
 * ces trois choses, et sur la seule qui compte vraiment : <b>un jeton que nous n'avons pas émis ne
 * doit jamais passer</b>.</p>
 *
 * <p>L'horloge est injectée plutôt que subie. Vérifier « refuse une soumission en moins de trois
 * secondes » en dormant trois secondes rendrait la suite lente, et vérifier « refuse au-delà d'une
 * heure » serait tout simplement impossible. Deux horloges fixes suffisent : une pour l'émission,
 * une pour la vérification.</p>
 */
@DisplayName("HumanChallengeService (défi de vérification humaine)")
class HumanChallengeServiceTest {

    private static final String SECRET = "secret-de-test-suffisamment-long";
    private static final Instant T0 = Instant.parse("2026-07-24T10:00:00Z");

    /** Service dont l'horloge est figée à `T0 + décalage`. */
    private static HumanChallengeService at(Duration offset) {
        return new HumanChallengeService(SECRET, Clock.fixed(T0.plus(offset), ZoneOffset.UTC));
    }

    private static String tokenIssuedAtT0() {
        return at(Duration.ZERO).issue();
    }

    @Test
    @DisplayName("un jeton émis puis vérifié après un délai humain est accepté")
    void accepts_token_after_human_dwell() {
        String token = tokenIssuedAtT0();

        assertThat(at(Duration.ofSeconds(30)).verify(token)).isNull();
    }

    @ParameterizedTest(name = "vérifié à T+{0}s → accepté")
    @DisplayName("accepte sur toute la fenêtre de validité, bornes comprises")
    @ValueSource(longs = { 3, 60, 1800, 3600 })
    void accepts_across_the_whole_window(long seconds) {
        String token = tokenIssuedAtT0();

        assertThat(at(Duration.ofSeconds(seconds)).verify(token)).isNull();
    }

    @ParameterizedTest(name = "vérifié à T+{0}s → refusé ({1})")
    @DisplayName("refuse en deçà du délai humain et au-delà de la validité")
    @CsvSource({
        "0,    trop rapidement",   // soumission instantanée : signature d'un automate
        "1,    trop rapidement",
        "2,    trop rapidement",
        "3601, expirée",           // une seconde après l'heure
        "86400, expirée",
    })
    void rejects_outside_the_window(long seconds, String motifAttendu) {
        String token = tokenIssuedAtT0();

        assertThat(at(Duration.ofSeconds(seconds)).verify(token))
            .as("motif de refus à T+%ds", seconds)
            .containsIgnoringCase(motifAttendu);
    }

    @Test
    @DisplayName("refuse un jeton daté du futur")
    void rejects_token_from_the_future() {
        // Émis à T0, vérifié à T0 − 10 s : incohérence d'horloge ou jeton fabriqué.
        String token = tokenIssuedAtT0();

        assertThat(at(Duration.ofSeconds(-10)).verify(token)).containsIgnoringCase("expirée");
    }

    @ParameterizedTest(name = "jeton = « {0} » → refusé")
    @DisplayName("refuse un jeton absent, vide ou malformé")
    @NullAndEmptySource
    @ValueSource(strings = { "   ", "sansPoint", "deux.parties", "a.b.c.d", "nonce.pasUnNombre.sig" })
    void rejects_malformed_tokens(String token) {
        assertThat(at(Duration.ofSeconds(30)).verify(token)).isNotNull();
    }

    /**
     * Le cœur du dispositif. Sans cette vérification, n'importe qui pourrait fabriquer un jeton daté
     * comme il l'entend et contourner entièrement le filtre.
     */
    @Test
    @DisplayName("refuse un jeton signé avec une autre clé")
    void rejects_token_signed_with_another_key() {
        HumanChallengeService autreServeur =
            new HumanChallengeService("une-toute-autre-cle", Clock.fixed(T0, ZoneOffset.UTC));
        String tokenEtranger = autreServeur.issue();

        assertThat(at(Duration.ofSeconds(30)).verify(tokenEtranger))
            .containsIgnoringCase("invalide");
    }

    @Test
    @DisplayName("refuse un jeton dont l'horodatage a été retouché")
    void rejects_token_with_tampered_timestamp() {
        String token = tokenIssuedAtT0();
        String[] parts = token.split("\\.");
        // On rajeunit le jeton pour prolonger sa validité : la signature ne suit pas.
        String falsifie = parts[0] + "." + T0.plus(Duration.ofHours(5)).toEpochMilli() + "." + parts[2];

        assertThat(at(Duration.ofHours(5)).verify(falsifie)).containsIgnoringCase("invalide");
    }

    @Test
    @DisplayName("deux émissions produisent deux jetons différents")
    void issues_distinct_tokens() {
        HumanChallengeService service = at(Duration.ZERO);

        // Même horloge : seule la partie aléatoire peut les distinguer. Sans elle, deux inscriptions
        // simultanées partageraient le même jeton.
        assertThat(service.issue()).isNotEqualTo(service.issue());
    }

    @Test
    @DisplayName("sans secret configuré : mécanisme inactif, tout passe")
    void disabled_without_secret() {
        HumanChallengeService inactif =
            new HumanChallengeService("", Clock.fixed(T0, ZoneOffset.UTC));

        assertThat(inactif.isEnabled()).isFalse();
        assertThat(inactif.issue()).isEmpty();
        assertThat(inactif.verify(null)).isNull();
        assertThat(inactif.verify("n-importe-quoi")).isNull();
    }

    @Test
    @DisplayName("avec un secret configuré : mécanisme actif")
    void enabled_with_secret() {
        assertThat(at(Duration.ZERO).isEnabled()).isTrue();
    }
}
