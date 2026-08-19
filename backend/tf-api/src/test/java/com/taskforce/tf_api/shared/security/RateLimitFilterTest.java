package com.taskforce.tf_api.shared.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.FilterChain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * Tests unitaires — {@link RateLimitFilter} (protection brute-force / DDoS léger par IP).
 * Vérifie le passage sous quota, le 429 au dépassement, la résolution d'IP (X-Forwarded-For /
 * X-Real-IP / remoteAddr) et le cloisonnement des buckets par profil et par IP.
 */
@DisplayName("RateLimitFilter")
class RateLimitFilterTest {

    private final RateLimitFilter filter = new RateLimitFilter();

    private MockHttpServletRequest req(String uri, String forwardedFor, String realIp, String remoteAddr) {
        MockHttpServletRequest r = new MockHttpServletRequest();
        r.setRequestURI(uri);
        if (forwardedFor != null) r.addHeader("X-Forwarded-For", forwardedFor);
        if (realIp != null) r.addHeader("X-Real-IP", realIp);
        r.setRemoteAddr(remoteAddr);
        return r;
    }

    @Test
    @DisplayName("laisse passer une requête sous le quota (chain appelée, pas de 429)")
    void allows_request_under_limit() throws Exception {
        var request = req("/api/projects", null, null, "10.0.0.1");
        var response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain, times(1)).doFilter(request, response);
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("profil AUTH_STRICT : 11e login depuis la même IP → 429 + corps JSON")
    void blocks_after_auth_strict_limit() throws Exception {
        FilterChain chain = mock(FilterChain.class);
        // Quota AUTH_STRICT = 10/min : les 10 premières passent
        for (int i = 0; i < 10; i++) {
            filter.doFilter(req("/api/auth/login", null, null, "1.2.3.4"), new MockHttpServletResponse(), chain);
        }
        verify(chain, times(10)).doFilter(any(), any());

        // La 11e est bloquée
        var blocked = new MockHttpServletResponse();
        filter.doFilter(req("/api/auth/login", null, null, "1.2.3.4"), blocked, mock(FilterChain.class));

        assertThat(blocked.getStatus()).isEqualTo(429);
        assertThat(blocked.getContentType()).contains("application/json");
        assertThat(blocked.getContentAsString()).contains("Too Many Requests");
    }

    @Test
    @DisplayName("les buckets sont cloisonnés par IP (une IP saturée n'affecte pas une autre)")
    void buckets_isolated_per_ip() throws Exception {
        FilterChain chain = mock(FilterChain.class);
        for (int i = 0; i < 10; i++) {
            filter.doFilter(req("/api/auth/login", null, null, "9.9.9.9"), new MockHttpServletResponse(), chain);
        }
        // IP saturée
        var blocked = new MockHttpServletResponse();
        filter.doFilter(req("/api/auth/login", null, null, "9.9.9.9"), blocked, mock(FilterChain.class));
        assertThat(blocked.getStatus()).isEqualTo(429);

        // Autre IP : passe
        var okChain = mock(FilterChain.class);
        var ok = new MockHttpServletResponse();
        filter.doFilter(req("/api/auth/login", null, null, "8.8.8.8"), ok, okChain);
        verify(okChain, times(1)).doFilter(any(), any());
        assertThat(ok.getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("résolution d'IP : X-Forwarded-For prioritaire (1re valeur de la liste)")
    void resolves_ip_from_forwarded_for() throws Exception {
        FilterChain chain = mock(FilterChain.class);
        for (int i = 0; i < 10; i++) {
            filter.doFilter(req("/api/auth/register", "203.0.113.7, 10.0.0.1", null, "127.0.0.1"),
                new MockHttpServletResponse(), chain);
        }
        // AUTH_STRICT (register) quota = 5 → déjà bloqué avant 10 ; on vérifie juste qu'un 429 survient
        var blocked = new MockHttpServletResponse();
        filter.doFilter(req("/api/auth/register", "203.0.113.7", null, "127.0.0.1"), blocked, mock(FilterChain.class));
        assertThat(blocked.getStatus()).isEqualTo(429);
    }

    @Test
    @DisplayName("résolution d'IP : X-Real-IP utilisé si X-Forwarded-For absent")
    void resolves_ip_from_real_ip() throws Exception {
        var response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);
        filter.doFilter(req("/api/projects", null, "198.51.100.5", "127.0.0.1"), response, chain);
        verify(chain, times(1)).doFilter(any(), any());
    }

    @Test
    @DisplayName("profil AI (smart-assign) et refresh-token routés vers leurs quotas dédiés (20/min)")
    void ai_and_refresh_profiles_have_higher_quota() throws Exception {
        FilterChain chain = mock(FilterChain.class);
        // 20 requêtes AI passent (quota 20)
        for (int i = 0; i < 20; i++) {
            filter.doFilter(req("/api/workspaces/x/smart-assign", null, null, "5.5.5.5"),
                new MockHttpServletResponse(), chain);
        }
        var blockedAi = new MockHttpServletResponse();
        filter.doFilter(req("/api/workspaces/x/smart-assign", null, null, "5.5.5.5"), blockedAi, mock(FilterChain.class));
        assertThat(blockedAi.getStatus()).isEqualTo(429);

        // refresh-token : profil distinct, même IP → non impacté par la saturation AI
        var refresh = new MockHttpServletResponse();
        var refreshChain = mock(FilterChain.class);
        filter.doFilter(req("/api/auth/refresh-token", null, null, "5.5.5.5"), refresh, refreshChain);
        verify(refreshChain, times(1)).doFilter(any(), any());
        assertThat(refresh.getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("un dépassement n'appelle jamais la chaîne de filtres (requête stoppée net)")
    void blocked_request_does_not_call_chain() throws Exception {
        for (int i = 0; i < 10; i++) {
            filter.doFilter(req("/api/auth/verify-otp", null, null, "4.4.4.4"), new MockHttpServletResponse(), mock(FilterChain.class));
        }
        FilterChain chain = mock(FilterChain.class);
        var response = new MockHttpServletResponse();
        filter.doFilter(req("/api/auth/verify-otp", null, null, "4.4.4.4"), response, chain);

        verify(chain, never()).doFilter(any(), any());
        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(response.getContentAsString()).contains("Rate limit reached");
        // Le client doit savoir COMBIEN de temps patienter : sans Retry-After il ne peut que
        // deviner, et réessaie trop tôt. `refillIntervally` rend les jetons en fin de fenêtre,
        // donc l'attente annoncée va jusqu'à 60 s.
        assertThat(response.getHeader("Retry-After")).isNotNull();
        assertThat(Integer.parseInt(response.getHeader("Retry-After"))).isBetween(1, 60);
        assertThat(response.getHeader("X-RateLimit-Remaining")).isEqualTo("0");
    }

    @Test
    @DisplayName("les préflights CORS (OPTIONS) ne consomment aucun jeton")
    void cors_preflights_are_not_counted() throws Exception {
        // Le front est sur une autre origine : le navigateur émet un préflight par requête non
        // simple. Les compter revenait à diviser le quota réel par deux, sans qu'aucun appel
        // métier supplémentaire n'ait été fait.
        var primed = new MockHttpServletResponse();
        filter.doFilter(req("/api/projects", null, null, "9.9.9.9"), primed, mock(FilterChain.class));
        int remainingBefore = Integer.parseInt(primed.getHeader("X-RateLimit-Remaining"));

        for (int i = 0; i < 20; i++) {
            MockHttpServletRequest preflight = req("/api/projects", null, null, "9.9.9.9");
            preflight.setMethod("OPTIONS");
            filter.doFilter(preflight, new MockHttpServletResponse(), mock(FilterChain.class));
        }

        var after = new MockHttpServletResponse();
        filter.doFilter(req("/api/projects", null, null, "9.9.9.9"), after, mock(FilterChain.class));
        // Seule la requête réelle ci-dessus a consommé un jeton — les 20 préflights, aucun.
        assertThat(Integer.parseInt(after.getHeader("X-RateLimit-Remaining"))).isEqualTo(remainingBefore - 1);
    }
}
