package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import com.taskforce.tf_api.core.dto.response.AiInsightResponse;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Valide la <b>sémantique de cache des insights IA</b> — l'expression {@code unless} de
 * {@link AnalyticsService#generateInsights} : seul un résultat <b>généré</b> ({@code mode=generated})
 * est mis en cache ; jamais un repli ({@code fallback}) ni le mur payant ({@code upgrade}), sinon un
 * plan upgradé ou une panne LLM transitoire resterait figé le temps du TTL.
 *
 * <p>Slice de cache léger (proxy Spring + {@code ConcurrentMapCacheManager}) : pas de contexte complet
 * ni les 14 dépendances du service. La sonde reproduit l'annotation À L'IDENTIQUE — un SpEL erroné y
 * échouerait avant la prod (le cache dev/test est en mémoire, donc les tests Mockito ne l'exercent pas).
 */
@SpringJUnitConfig(AnalyticsServiceInsightsCacheTest.CacheSlice.class)
@DisplayName("AnalyticsService — cache des insights (@Cacheable unless mode=generated)")
class AnalyticsServiceInsightsCacheTest {

    static final AtomicInteger CALLS = new AtomicInteger();

    @Configuration
    @EnableCaching
    static class CacheSlice {
        @Bean
        CacheManager cacheManager() {
            return new ConcurrentMapCacheManager("ai-insights");
        }

        @Bean
        InsightsProbe insightsProbe() {
            return new InsightsProbe();
        }
    }

    /** Reproduit EXACTEMENT l'annotation de {@code generateInsights} (même clé, même {@code unless}). */
    static class InsightsProbe {
        @Cacheable(cacheNames = "ai-insights",
            key = "#slug + ':' + #userId",
            unless = "#result == null || #result.isEmpty() || #result[0].mode != 'generated'")
        public List<AiInsightResponse> insights(String slug, Long userId, String mode) {
            CALLS.incrementAndGet();
            return List.of(AiInsightResponse.builder().agent("COO").mode(mode).build());
        }
    }

    @Autowired
    private InsightsProbe probe;

    @BeforeEach
    void reset() {
        CALLS.set(0);
    }

    @Test
    @DisplayName("succès généré : le 2e appel est servi par le cache (une seule exécution)")
    void generated_is_cached() {
        probe.insights("gen", 1L, "generated");
        probe.insights("gen", 1L, "generated");

        assertThat(CALLS.get()).isEqualTo(1);
    }

    @Test
    @DisplayName("repli fallback : jamais mis en cache (recalculé à chaque appel)")
    void fallback_not_cached() {
        probe.insights("fb", 2L, "fallback");
        probe.insights("fb", 2L, "fallback");

        assertThat(CALLS.get()).isEqualTo(2);
    }

    @Test
    @DisplayName("mur payant upgrade : jamais mis en cache")
    void upgrade_not_cached() {
        probe.insights("up", 3L, "upgrade");
        probe.insights("up", 3L, "upgrade");

        assertThat(CALLS.get()).isEqualTo(2);
    }
}
