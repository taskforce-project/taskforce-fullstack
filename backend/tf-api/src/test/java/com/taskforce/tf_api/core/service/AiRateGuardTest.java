package com.taskforce.tf_api.core.service;

import java.time.Duration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.shared.exception.AiRateLimitedException;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link AiRateGuard} (garde-débit IA par minute, fenêtres Redis global + compte).
 * Clés minute time-based → matchers {@code startsWith}. Strictness LENIENT (le stub {@code opsForValue}
 * du setUp est inutile dans les cas « sans Redis »).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("AiRateGuard (garde-débit IA par minute)")
class AiRateGuardTest {

    @Mock private ObjectProvider<StringRedisTemplate> redisProvider;
    @Mock private StringRedisTemplate redis;
    @Mock private ValueOperations<String, String> ops;

    private AiRateGuard guard;

    @BeforeEach
    void setUp() {
        guard = new AiRateGuard(redisProvider);
        ReflectionTestUtils.setField(guard, "globalTpm", 8000L);
        ReflectionTestUtils.setField(guard, "accountTpm", 6000L);
        when(redis.opsForValue()).thenReturn(ops);
    }

    @Test
    @DisplayName("assertWithinRate : pas de Redis (dev/test) → fail-open (ne lève pas)")
    void assertWithinRate_failopen_without_redis() {
        when(redisProvider.getIfAvailable()).thenReturn(null);
        assertThatCode(() -> guard.assertWithinRate(99L)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("assertWithinRate : fenêtre globale pleine → 429 (AiRateLimitedException)")
    void assertWithinRate_throws_when_global_full() {
        when(redisProvider.getIfAvailable()).thenReturn(redis);
        when(ops.get(startsWith("ai:tpm:g:"))).thenReturn("8000"); // == globalTpm
        assertThatThrownBy(() -> guard.assertWithinRate(99L))
            .isInstanceOf(AiRateLimitedException.class)
            .hasMessageContaining("satur");
    }

    @Test
    @DisplayName("assertWithinRate : part du compte dépassée (global OK) → 429")
    void assertWithinRate_throws_when_account_full() {
        when(redisProvider.getIfAvailable()).thenReturn(redis);
        when(ops.get(startsWith("ai:tpm:g:"))).thenReturn("100");   // global sous le seuil
        when(ops.get(startsWith("ai:tpm:a:"))).thenReturn("6000");  // compte au seuil
        assertThatThrownBy(() -> guard.assertWithinRate(99L))
            .isInstanceOf(AiRateLimitedException.class);
    }

    @Test
    @DisplayName("assertWithinRate : global + compte sous les seuils → OK")
    void assertWithinRate_ok_when_under() {
        when(redisProvider.getIfAvailable()).thenReturn(redis);
        when(ops.get(anyString())).thenReturn("100");
        assertThatCode(() -> guard.assertWithinRate(99L)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("assertWithinRate : incident Redis → fail-open (ne lève pas)")
    void assertWithinRate_failopen_on_redis_error() {
        when(redisProvider.getIfAvailable()).thenReturn(redis);
        when(ops.get(anyString())).thenThrow(new RuntimeException("redis down"));
        assertThatCode(() -> guard.assertWithinRate(99L)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("recordTokens : incrémente la fenêtre globale + celle du compte + TTL à la 1re écriture")
    void recordTokens_bumps_both_windows() {
        when(redisProvider.getIfAvailable()).thenReturn(redis);
        when(ops.increment(anyString(), eq(150L))).thenReturn(150L); // 1re écriture → total == tokens

        guard.recordTokens(99L, 150L);

        verify(ops).increment(startsWith("ai:tpm:g:"), eq(150L));
        verify(ops).increment(startsWith("ai:tpm:a:99:"), eq(150L));
        verify(redis, times(2)).expire(anyString(), any(Duration.class));
    }

    @Test
    @DisplayName("recordTokens : pas de Redis → no-op (ne lève pas)")
    void recordTokens_noop_without_redis() {
        when(redisProvider.getIfAvailable()).thenReturn(null);
        assertThatCode(() -> guard.recordTokens(99L, 150L)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("assertWithinRate : plafond requêtes/minute du compte atteint → 429")
    void assertWithinRate_throws_when_account_rpm_full() {
        ReflectionTestUtils.setField(guard, "accountRpm", 1L);
        when(redisProvider.getIfAvailable()).thenReturn(redis);
        when(ops.get(startsWith("ai:tpm:g:"))).thenReturn("0");    // tokens sous les seuils
        when(ops.get(startsWith("ai:tpm:a:"))).thenReturn("0");
        when(ops.get(startsWith("ai:rpm:a:99:"))).thenReturn("1"); // déjà 1 requête cette minute == accountRpm
        assertThatThrownBy(() -> guard.assertWithinRate(99L))
            .isInstanceOf(AiRateLimitedException.class);
    }

    @Test
    @DisplayName("assertWithinRate : sous le plafond requêtes/minute → OK + incrémente le compteur")
    void assertWithinRate_bumps_rpm_counter_when_under() {
        ReflectionTestUtils.setField(guard, "accountRpm", 5L);
        when(redisProvider.getIfAvailable()).thenReturn(redis);
        when(ops.get(anyString())).thenReturn("0");                // tout sous les seuils
        when(ops.increment(startsWith("ai:rpm:a:99:"), eq(1L))).thenReturn(1L);
        assertThatCode(() -> guard.assertWithinRate(99L)).doesNotThrowAnyException();
        verify(ops).increment(startsWith("ai:rpm:a:99:"), eq(1L));
    }
}
