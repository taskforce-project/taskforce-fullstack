package com.taskforce.tf_api.shared.security;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

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

    // Buckets par IP — clé = "${ip}:${profil}"
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String ip = resolveClientIp(request);
        String path = request.getRequestURI();

        RateProfile profile = profileFor(path);
        String bucketKey = ip + ":" + profile.name();
        Bucket bucket = buckets.computeIfAbsent(bucketKey, k -> buildBucket(profile));

        if (bucket.tryConsume(1)) {
            chain.doFilter(request, response);
        } else {
            log.warn("Rate limit dépassé — ip={} path={} profile={}", ip, path, profile);
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Too Many Requests\",\"message\":\"Limite de requêtes atteinte. Réessayez dans quelques secondes.\"}");
        }
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

    private Bucket buildBucket(RateProfile profile) {
        Bandwidth limit = switch (profile) {
            case AUTH_STRICT  -> Bandwidth.builder().capacity(10) .refillIntervally(10, Duration.ofMinutes(1)).build();
            case AUTH_REFRESH -> Bandwidth.builder().capacity(20) .refillIntervally(20, Duration.ofMinutes(1)).build();
            case AI           -> Bandwidth.builder().capacity(20) .refillIntervally(20, Duration.ofMinutes(1)).build();
            case DEFAULT      -> Bandwidth.builder().capacity(200).refillIntervally(200, Duration.ofMinutes(1)).build();
        };
        return Bucket.builder().addLimit(limit).build();
    }

    private String resolveClientIp(HttpServletRequest request) {
        // Respect du header X-Forwarded-For (proxy/load-balancer)
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }
}
