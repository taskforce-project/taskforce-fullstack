package com.taskforce.tf_api.core.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Job planifié de <b>purge des refresh tokens</b> (FIX-004).
 *
 * <p>Supprime les tokens expirés et les tokens révoqués depuis plus de 30 jours, afin que la table
 * {@code refresh_tokens} ne croisse pas indéfiniment (rotation + logout révoquent en continu).
 * La rotation, la révocation au logout et la validité sont gérées en amont par {@link JwtService}
 * et {@code AuthService} ; ce scheduler ne fait que le ménage différé.</p>
 *
 * <p>Cron surchargeable via {@code taskforce.tokens.cleanup-cron} (défaut : tous les jours à 03h00).</p>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class TokenCleanupScheduler {

    private final JwtService jwtService;

    @Scheduled(cron = "${taskforce.tokens.cleanup-cron:0 0 3 * * *}")
    public void purgeStaleTokens() {
        int expired = jwtService.cleanupExpiredTokens();
        int revoked = jwtService.cleanupRevokedTokens();
        log.info("Purge refresh tokens terminée : {} expirés + {} révoqués supprimés", expired, revoked);
    }
}
