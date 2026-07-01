package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires (session, priorité critique) — {@link TokenCleanupScheduler}.
 * Le cron délègue la purge des refresh tokens expirés/révoqués à {@link JwtService}.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("TokenCleanupScheduler")
class TokenCleanupSchedulerTest {

    @Mock private JwtService jwtService;
    @InjectMocks private TokenCleanupScheduler scheduler;

    @Test
    @DisplayName("purgeStaleTokens déclenche le nettoyage des tokens expirés ET révoqués")
    void should_delegate_both_cleanups() {
        when(jwtService.cleanupExpiredTokens()).thenReturn(5);
        when(jwtService.cleanupRevokedTokens()).thenReturn(2);

        scheduler.purgeStaleTokens();

        verify(jwtService).cleanupExpiredTokens();
        verify(jwtService).cleanupRevokedTokens();
    }
}
