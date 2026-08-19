package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.core.repository.OAuthStateRepository;
import com.taskforce.tf_api.core.repository.WorkspaceInvitationRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link RetentionScheduler}.
 *
 * <p>L'enjeu de ce job n'est pas de supprimer (une ligne de JPQL par purge), c'est de <b>ne pas
 * s'arrêter</b> : une purge qui échoue en silence sur la première table gèlerait toute la rétention
 * sans que personne ne s'en aperçoive. C'est cette isolation que les tests vérifient en priorité.</p>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("RetentionScheduler")
class RetentionSchedulerTest {

    private static final int GRACE_DAYS = 30;

    @Mock private OtpService                    otpService;
    @Mock private OAuthStateRepository          oauthStateRepository;
    @Mock private WorkspaceInvitationRepository invitationRepository;

    @InjectMocks private RetentionScheduler scheduler;

    @Captor private ArgumentCaptor<LocalDateTime> cutoffCaptor;

    private void withGracePeriod() {
        ReflectionTestUtils.setField(scheduler, "invitationGraceDays", GRACE_DAYS);
    }

    @Test
    @DisplayName("applique les trois purges en une passe")
    void runsEveryPurge() {
        withGracePeriod();

        scheduler.applyRetentionPolicies();

        verify(otpService).cleanupExpiredOtps();
        verify(oauthStateRepository).deleteByExpiresAtBefore(any());
        verify(invitationRepository).deleteStaleInvitations(any());
    }

    /**
     * Le cas qui justifie le try/catch par purge : quelle que soit celle qui casse, les deux autres
     * doivent s'exécuter et le job se terminer sans propager l'exception (sinon Spring ne relancerait
     * ce job que le lendemain, en repartant du même échec).
     */
    @ParameterizedTest(name = "un échec sur « {0} » n''empêche pas les autres purges")
    @ValueSource(strings = {"otp", "oauth", "invitations"})
    @DisplayName("isole l'échec d'une purge")
    void isolatesFailures(String failing) {
        withGracePeriod();
        RuntimeException boom = new RuntimeException("indisponible");

        switch (failing) {
            case "otp"         -> when(otpService.cleanupExpiredOtps()).thenThrow(boom);
            case "oauth"       -> when(oauthStateRepository.deleteByExpiresAtBefore(any())).thenThrow(boom);
            case "invitations" -> when(invitationRepository.deleteStaleInvitations(any())).thenThrow(boom);
            default            -> throw new IllegalArgumentException(failing);
        }

        scheduler.applyRetentionPolicies();

        verify(otpService).cleanupExpiredOtps();
        verify(oauthStateRepository).deleteByExpiresAtBefore(any());
        verify(invitationRepository).deleteStaleInvitations(any());
    }

    @Test
    @DisplayName("purge les invitations expirées depuis plus que le délai de grâce")
    void appliesInvitationGracePeriod() {
        withGracePeriod();

        scheduler.applyRetentionPolicies();

        verify(invitationRepository).deleteStaleInvitations(cutoffCaptor.capture());
        LocalDateTime expected = LocalDateTime.now().minusDays(GRACE_DAYS);

        // Tolérance de quelques secondes : la borne est calculée sur l'horloge du job.
        assertThat(cutoffCaptor.getValue()).isCloseTo(expected, within(5, ChronoUnit.SECONDS));
    }

    @Test
    @DisplayName("purge les states OAuth déjà expirés, sans délai de grâce")
    void purgesOauthStatesAtExpiry() {
        withGracePeriod();

        scheduler.applyRetentionPolicies();

        verify(oauthStateRepository).deleteByExpiresAtBefore(cutoffCaptor.capture());

        // Un state est un jeton anti-CSRF à usage unique : passé son échéance il n'a plus aucune
        // valeur, aucune raison donc de le conserver au-delà.
        assertThat(cutoffCaptor.getValue()).isCloseTo(LocalDateTime.now(), within(5, ChronoUnit.SECONDS));
    }
}
