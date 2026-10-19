package com.taskforce.tf_api.shared.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import javax.crypto.SecretKey;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Défi de second facteur des connexions externes (OSS-1.1) : le navigateur ne peut ni lire les jetons
 * scellés, ni les modifier, ni réutiliser un défi expiré.
 */
@DisplayName("OAuthTwoFactorChallenge")
class OAuthTwoFactorChallengeTest {

    private static final Instant T0 = Instant.parse("2026-10-14T10:00:00Z");
    private static final SecretKey KEY = OAuthTwoFactorChallenge.deriveKey("test-secret");
    private static final OAuthTwoFactorChallenge.Pending PENDING = new OAuthTwoFactorChallenge.Pending(
        42L, "access-token-value", "refresh-token-value", 300, 1800, "Ada", "Lovelace");

    private static OAuthTwoFactorChallenge at(SecretKey key, Instant instant) {
        return new OAuthTwoFactorChallenge(key, Clock.fixed(instant, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("rend exactement ce qui a été scellé")
    void roundTrip() {
        String challenge = at(KEY, T0).seal(PENDING);

        assertThat(at(KEY, T0).open(challenge)).isEqualTo(PENDING);
    }

    @Test
    @DisplayName("ne laisse lire aucun jeton au navigateur")
    void opaque() {
        String challenge = at(KEY, T0).seal(PENDING);

        // Des marqueurs assez longs pour qu'un défi aléatoire ne les contienne jamais par hasard : avec « Ada » (trois
        // caractères), le texte chiffré en base64 contenait la séquence environ une fois sur 700 (test instable).
        assertThat(challenge).doesNotContain("access-token").doesNotContain("refresh-token").doesNotContain("Lovelace");
    }

    @Test
    @DisplayName("s'ouvre sur une autre instance qui partage le même secret")
    void sharedSecretAcrossInstances() {
        String challenge = at(OAuthTwoFactorChallenge.deriveKey("shared"), T0).seal(PENDING);

        assertThat(at(OAuthTwoFactorChallenge.deriveKey("shared"), T0).open(challenge)).isEqualTo(PENDING);
    }

    @Test
    @DisplayName("reste valable juste avant l'expiration")
    void validJustBeforeExpiry() {
        String challenge = at(KEY, T0).seal(PENDING);

        Instant justBefore = T0.plus(OAuthTwoFactorChallenge.TTL).minus(Duration.ofSeconds(1));
        assertThat(at(KEY, justBefore).open(challenge)).isEqualTo(PENDING);
    }

    @Test
    @DisplayName("refuse un défi expiré")
    void expired() {
        String challenge = at(KEY, T0).seal(PENDING);

        Instant after = T0.plus(OAuthTwoFactorChallenge.TTL).plus(Duration.ofSeconds(1));
        assertThatThrownBy(() -> at(KEY, after).open(challenge)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("refuse un défi modifié")
    void tampered() {
        String challenge = at(KEY, T0).seal(PENDING);
        int i = challenge.length() / 2;
        char flipped = challenge.charAt(i) == 'A' ? 'B' : 'A';
        String tampered = challenge.substring(0, i) + flipped + challenge.substring(i + 1);

        assertThatThrownBy(() -> at(KEY, T0).open(tampered)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("refuse un défi scellé avec une autre clé")
    void otherKey() {
        String challenge = at(OAuthTwoFactorChallenge.deriveKey("one"), T0).seal(PENDING);

        assertThatThrownBy(() -> at(OAuthTwoFactorChallenge.deriveKey("two"), T0).open(challenge))
            .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("tire une clé au hasard quand aucun secret n'est configuré")
    void randomKeyWithoutSecret() {
        String challenge = at(OAuthTwoFactorChallenge.deriveKey(""), T0).seal(PENDING);

        assertThatThrownBy(() -> at(OAuthTwoFactorChallenge.deriveKey(""), T0).open(challenge))
            .isInstanceOf(BusinessException.class);
    }

    @ParameterizedTest(name = "refuse « {0} »")
    @NullAndEmptySource
    @ValueSource(strings = {"garbage", "!!!", "AAAA", "eyJhbGciOiJub25lIn0"})
    void unreadable(String challenge) {
        assertThatThrownBy(() -> at(KEY, T0).open(challenge)).isInstanceOf(BusinessException.class);
    }
}
