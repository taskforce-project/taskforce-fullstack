package com.taskforce.tf_api.shared.security;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.BucketConfiguration;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.distributed.proxy.ProxyManager;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Filtre de rate limiting par adresse IP.
 *
 * Limites appliquées (par IP) :
 *  - /api/auth/login              → 10 req / 60 s  (brute force protection)
 *  - /api/auth/register           → 5  req / 60 s
 *  - /api/auth/forgot-password    → 5  req / 60 s
 *  - /api/auth/verify-otp         → 5  req / 60 s
 *  - /api/auth/resend-otp         → 5  req / 60 s
 *  - /api/auth/refresh-token      → 20 req / 60 s  (clients silencieux fréquents)
 *  - endpoints IA (smart-assign)  → 20 req / 60 s
 *  - autres endpoints             → 200 req / 60 s (protection DDoS léger)
 */
@Slf4j
public class RateLimitFilter extends OncePerRequestFilter {

    // Mode local (mono-instance) — buckets en mémoire, clé = "${ip}:${profil}".
    private final Map<String, Bucket> localBuckets = new ConcurrentHashMap<>();

    // Mode distribué (multi-instances) — buckets partagés via Redis. null → mode local. TF-SEC-011.
    private final ProxyManager<String> proxyManager;

    /** Mode local (dev/test, mono-instance). */
    public RateLimitFilter() {
        this(null);
    }

    /** Mode distribué si {@code proxyManager} non null (buckets Redis partagés), sinon local. */
    public RateLimitFilter(ProxyManager<String> proxyManager) {
        this.proxyManager = proxyManager;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String ip = resolveClientIp(request);
        String path = request.getRequestURI();

        RateProfile profile = profileFor(path);
        String bucketKey = ip + ":" + profile.name();
        Bucket bucket = resolveBucket(bucketKey, profile);

        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) {
            // Le client peut ainsi lever le pied AVANT le mur, plutôt que de le découvrir en 429.
            response.setHeader("X-RateLimit-Remaining", String.valueOf(probe.getRemainingTokens()));
            chain.doFilter(request, response);
        } else {
            // `refillIntervally` rend tous les jetons d'un coup en fin de fenêtre : l'attente réelle
            // va de 0 à 60 s. Sans Retry-After, le client ne peut que deviner — et réessayer trop tôt.
            long waitSeconds = Math.max(1, TimeUnit.NANOSECONDS.toSeconds(probe.getNanosToWaitForRefill()));
            log.warn("Rate limit dépassé — ip={} path={} profile={} retryAfter={}s", ip, path, profile, waitSeconds);
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader("Retry-After", String.valueOf(waitSeconds));
            response.setHeader("X-RateLimit-Remaining", "0");
            response.setContentType("application/json");
            response.getWriter().write(
                "{\"error\":\"Too Many Requests\",\"message\":\"Rate limit reached. Retry in "
                    + waitSeconds + "s.\",\"retryAfterSeconds\":" + waitSeconds + "}");
        }
    }

    /**
     * Les préflights CORS ne sont pas des actions utilisateur : le navigateur en émet un par requête
     * non simple, sur une origine différente (localhost:3000 → localhost:8080). Les compter revenait
     * à diviser par deux le quota réel — l'utilisateur atteignait la limite deux fois plus vite, sans
     * qu'aucun appel métier supplémentaire n'ait été fait.
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return HttpMethod.OPTIONS.matches(request.getMethod());
    }

    // =========================================================================

    private enum RateProfile {
        AUTH_STRICT,   // login, register, forgot-password, otp
        AUTH_REFRESH,  // refresh-token
        AI,            // smart-assign, assistant
        DEFAULT
    }

    private RateProfile profileFor(String path) {
        if (path.startsWith("/api/auth/login")
                || path.startsWith("/api/auth/register")
                || path.startsWith("/api/auth/forgot-password")
                || path.startsWith("/api/auth/verify-otp")
                || path.startsWith("/api/auth/resend-otp")) {
            return RateProfile.AUTH_STRICT;
        }
        if (path.startsWith("/api/auth/refresh-token")) {
            return RateProfile.AUTH_REFRESH;
        }
        if (path.contains("/smart-assign") || path.contains("/assistant")) {
            return RateProfile.AI;
        }
        return RateProfile.DEFAULT;
    }

    /** Résout le bucket : proxy Redis partagé si distribué, sinon bucket local en mémoire. */
    private Bucket resolveBucket(String bucketKey, RateProfile profile) {
        if (proxyManager != null) {
            return proxyManager.builder().build(bucketKey, () -> configFor(profile));
        }
        return localBuckets.computeIfAbsent(bucketKey,
            k -> Bucket.builder().addLimit(bandwidthFor(profile)).build());
    }

    private BucketConfiguration configFor(RateProfile profile) {
        return BucketConfiguration.builder().addLimit(bandwidthFor(profile)).build();
    }

    private Bandwidth bandwidthFor(RateProfile profile) {
        return switch (profile) {
            case AUTH_STRICT  -> Bandwidth.builder().capacity(10) .refillIntervally(10, Duration.ofMinutes(1)).build();
            case AUTH_REFRESH -> Bandwidth.builder().capacity(20) .refillIntervally(20, Duration.ofMinutes(1)).build();
            case AI           -> Bandwidth.builder().capacity(20) .refillIntervally(20, Duration.ofMinutes(1)).build();
            case DEFAULT      -> Bandwidth.builder().capacity(200).refillIntervally(200, Duration.ofMinutes(1)).build();
        };
    }

    private String resolveClientIp(HttpServletRequest request) {
        // Fix M5 (TF-SEC-RATELIMIT-IP) : ne PAS faire confiance à la valeur de GAUCHE de X-Forwarded-For.
        // nginx APPEND (`$proxy_add_x_forwarded_for`), donc le premier hop est fourni par le client →
        // spoofable : un attaquant obtenait un bucket neuf par requête et défaisait le throttle login/OTP.
        // Derrière Cloudflare (tunnel → nginx → backend), `CF-Connecting-IP` porte l'IP RÉELLE du client,
        // posée par Cloudflare (le client ne peut pas la falsifier — CF l'écrase) : seule valeur fiable.
        String cf = request.getHeader("CF-Connecting-IP");
        if (cf != null && !cf.isBlank()) {
            return cf.trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        // Repli : dernier hop du X-Forwarded-For (ajouté par le proxy de confiance le plus proche), jamais le premier.
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            String[] hops = forwarded.split(",");
            return hops[hops.length - 1].trim();
        }
        return request.getRemoteAddr();
    }
}
