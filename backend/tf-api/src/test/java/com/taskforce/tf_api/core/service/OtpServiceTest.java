package com.taskforce.tf_api.core.service;

import com.taskforce.tf_api.core.enums.OtpStatus;
import com.taskforce.tf_api.core.enums.OtpType;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.OtpVerification;
import com.taskforce.tf_api.core.repository.OtpVerificationRepository;
import com.taskforce.tf_api.util.TestDataBuilder;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("OtpService Tests")
class OtpServiceTest {

    @Mock
    private OtpVerificationRepository otpRepository;

    @Mock
    private EmailService emailService;

    @InjectMocks
    private OtpService otpService;

    @Captor
    private ArgumentCaptor<OtpVerification> otpCaptor;

    @Nested
    @DisplayName("Generate And Send OTP Tests")
    class GenerateAndSendOtpTests {

        @Test
        @DisplayName("devrait générer et envoyer OTP avec succès")
        void generateAndSendOtp_withValidData_shouldCreateAndSendOtp() {
            // Given
            String email = "test@example.com";
            String firstName = "Test";
            String keycloakId = "keycloak-123";

            when(otpRepository.countRecentOtpAttempts(eq(email), any(LocalDateTime.class))).thenReturn(0L);
            when(otpRepository.save(any(OtpVerification.class))).thenAnswer(i -> i.getArgument(0));
            when(otpRepository.expireAllPendingOtpsByEmail(email)).thenReturn(0);
            doNothing().when(emailService).sendOtpEmail(anyString(), anyString(), anyString());

            // When
            OtpVerification result = otpService.generateAndSendOtp(
                    email, firstName, OtpType.EMAIL_VERIFICATION, null, keycloakId, PlanType.FREE);

            // Then
            assertThat(result).isNotNull();
            assertThat(result.getEmail()).isEqualTo(email);
            assertThat(result.getOtpType()).isEqualTo(OtpType.EMAIL_VERIFICATION);
            assertThat(result.getOtpStatus()).isEqualTo(OtpStatus.PENDING);
            assertThat(result.getOtpCode()).hasSize(6);
            assertThat(result.getPlanType()).isEqualTo(PlanType.FREE.toString());

            verify(otpRepository).expireAllPendingOtpsByEmail(email);
            verify(otpRepository).save(any(OtpVerification.class));
            verify(emailService).sendOtpEmail(eq(email), anyString(), eq(firstName));
        }

        @Test
        @DisplayName("devrait expirer les OTP précédents avant de créer un nouveau")
        void generateAndSendOtp_shouldExpirePreviousOtps() {
            // Given
            String email = "test@example.com";
            when(otpRepository.countRecentOtpAttempts(eq(email), any(LocalDateTime.class))).thenReturn(0L);
            when(otpRepository.save(any(OtpVerification.class))).thenAnswer(i -> i.getArgument(0));

            // When
            otpService.generateAndSendOtp(email, "Test", OtpType.EMAIL_VERIFICATION, null, "keycloak-123", PlanType.FREE);

            // Then
            verify(otpRepository).expireAllPendingOtpsByEmail(email);
        }

        @Test
        @DisplayName("devrait lancer exception si trop de tentatives")
        void generateAndSendOtp_withTooManyAttempts_shouldThrowException() {
            // Given
            String email = "test@example.com";
            when(otpRepository.countRecentOtpAttempts(eq(email), any(LocalDateTime.class))).thenReturn(5L);

            // When/Then
            assertThatThrownBy(() -> otpService.generateAndSendOtp(
                    email, "Test", OtpType.EMAIL_VERIFICATION, null, "keycloak-123", PlanType.FREE))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Trop de tentatives");

            verify(otpRepository, never()).save(any());
            verify(emailService, never()).sendOtpEmail(any(), any(), any());
        }

        @Test
        @DisplayName("devrait créer OTP avec plan PRO")
        void generateAndSendOtp_withProPlan_shouldCreateOtpWithProPlan() {
            // Given
            String email = "pro@test.com";
            when(otpRepository.countRecentOtpAttempts(eq(email), any(LocalDateTime.class))).thenReturn(0L);
            when(otpRepository.save(any(OtpVerification.class))).thenAnswer(i -> i.getArgument(0));

            // When
            OtpVerification result = otpService.generateAndSendOtp(
                    email, "Pro User", OtpType.EMAIL_VERIFICATION, null, "keycloak-pro", PlanType.BUSINESS);

            // Then
            assertThat(result.getPlanType()).isEqualTo(PlanType.BUSINESS.toString());
        }

        @Test
        @DisplayName("devrait définir expiration à 15 minutes")
        void generateAndSendOtp_shouldSetExpirationTo15Minutes() {
            // Given
            String email = "test@example.com";
            when(otpRepository.countRecentOtpAttempts(eq(email), any(LocalDateTime.class))).thenReturn(0L);
            when(otpRepository.save(any(OtpVerification.class))).thenAnswer(i -> i.getArgument(0));

            // When
            OtpVerification result = otpService.generateAndSendOtp(
                    email, "Test", OtpType.EMAIL_VERIFICATION, null, "keycloak-123", PlanType.FREE);

            // Then
            assertThat(result.getExpiresAt()).isAfter(LocalDateTime.now().plusMinutes(14));
            assertThat(result.getExpiresAt()).isBefore(LocalDateTime.now().plusMinutes(16));
        }
    }

    @Nested
    @DisplayName("Verify OTP Tests")
    class VerifyOtpTests {

        @Test
        @DisplayName("devrait vérifier OTP valide avec succès")
        void verifyOtp_withValidOtp_shouldReturnTrue() {
            // Given
            String email = "test@example.com";
            String code = "123456";
            OtpVerification otp = TestDataBuilder.buildOtp(email, code, OtpType.EMAIL_VERIFICATION);

            when(otpRepository.findValidOtpByEmailAndCode(eq(email), eq(code), any(LocalDateTime.class)))
                    .thenReturn(Optional.of(otp));
            when(otpRepository.save(any(OtpVerification.class))).thenReturn(otp);

            // When
            boolean result = otpService.verifyOtp(email, code);

            // Then
            assertThat(result).isTrue();
            verify(otpRepository).save(otpCaptor.capture());
            assertThat(otpCaptor.getValue().getOtpStatus()).isEqualTo(OtpStatus.VERIFIED);
        }

        @Test
        @DisplayName("devrait retourner false si OTP non trouvé")
        void verifyOtp_withNonExistentOtp_shouldReturnFalse() {
            // Given
            String email = "test@example.com";
            String code = "999999";
            when(otpRepository.findValidOtpByEmailAndCode(eq(email), eq(code), any(LocalDateTime.class)))
                    .thenReturn(Optional.empty());

            // When
            boolean result = otpService.verifyOtp(email, code);

            // Then
            assertThat(result).isFalse();
            verify(otpRepository, never()).save(any());
        }

        @Test
        @DisplayName("devrait retourner false si OTP expiré")
        void verifyOtp_withExpiredOtp_shouldReturnFalse() {
            // Given
            String email = "test@example.com";
            String code = "123456";
            OtpVerification expiredOtp = TestDataBuilder.buildExpiredOtp();
            expiredOtp.setEmail(email);
            expiredOtp.setOtpCode(code);

            when(otpRepository.findValidOtpByEmailAndCode(eq(email), eq(code), any(LocalDateTime.class)))
                    .thenReturn(Optional.empty());

            // When
            boolean result = otpService.verifyOtp(email, code);

            // Then
            assertThat(result).isFalse();
        }
    }

    @Nested
    @DisplayName("Verify OTP And Get Details Tests")
    class VerifyOtpAndGetDetailsTests {

        @Test
        @DisplayName("devrait vérifier OTP et retourner détails")
        void verifyOtpAndGetDetails_withValidOtp_shouldReturnOtpDetails() {
            // Given
            String email = "test@example.com";
            String code = "123456";
            OtpVerification otp = TestDataBuilder.buildOtp(email, code, OtpType.EMAIL_VERIFICATION);
            otp.setOtpStatus(OtpStatus.PENDING);

            when(otpRepository.findPendingOtpByEmail(email))
                    .thenReturn(Optional.of(otp));
            when(otpRepository.save(any(OtpVerification.class))).thenReturn(otp);

            // When
            OtpVerification result = otpService.verifyOtpAndGetDetails(email, code);

            // Then
            assertThat(result).isNotNull();
            assertThat(result.getEmail()).isEqualTo(email);
            assertThat(result.getOtpCode()).isEqualTo(code);
            assertThat(result.getOtpStatus()).isEqualTo(OtpStatus.VERIFIED);
            verify(otpRepository).findPendingOtpByEmail(email);
            verify(otpRepository).save(any(OtpVerification.class));
        }

        @Test
        @DisplayName("devrait retourner null si OTP invalide")
        void verifyOtpAndGetDetails_withInvalidOtp_shouldReturnNull() {
            // Given
            String email = "test@example.com";
            String code = "999999";
            
            when(otpRepository.findPendingOtpByEmail(email))
                    .thenReturn(Optional.empty());

            // When
            OtpVerification result = otpService.verifyOtpAndGetDetails(email, code);

            // Then
            assertThat(result).isNull();
            verify(otpRepository).findPendingOtpByEmail(email);
            verify(otpRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("Update Plan Type Tests")
    class UpdatePlanTypeTests {

        @Test
        @DisplayName("devrait mettre à jour le plan avec succès")
        void updatePlanType_withExistingOtp_shouldUpdatePlan() {
            // Given
            String email = "test@example.com";
            String keycloakId = "keycloak-123";
            String planType = PlanType.BUSINESS.toString();
            OtpVerification otp = TestDataBuilder.buildOtp(email, "123456", OtpType.EMAIL_VERIFICATION);

            when(otpRepository.findPendingOtpByEmail(email)).thenReturn(Optional.of(otp));
            when(otpRepository.save(any(OtpVerification.class))).thenReturn(otp);

            // When
            boolean result = otpService.updatePlanType(email, keycloakId, planType);

            // Then
            assertThat(result).isTrue();
            verify(otpRepository).save(otpCaptor.capture());
            assertThat(otpCaptor.getValue().getPlanType()).isEqualTo(planType);
        }

        @Test
        @DisplayName("devrait retourner false si OTP non trouvé")
        void updatePlanType_withNoOtp_shouldReturnFalse() {
            // Given
            String email = "test@example.com";
            when(otpRepository.findPendingOtpByEmail(email)).thenReturn(Optional.empty());

            // When
            boolean result = otpService.updatePlanType(email, "keycloak-123", PlanType.BUSINESS.toString());

            // Then
            assertThat(result).isFalse();
            verify(otpRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("Get Latest Pending OTP Tests")
    class GetLatestPendingOtpTests {

        @Test
        @DisplayName("devrait retourner le dernier OTP en attente")
        void getLatestPendingOtp_withExistingOtp_shouldReturnOtp() {
            // Given
            String email = "test@example.com";
            OtpVerification otp = TestDataBuilder.buildOtp();
            when(otpRepository.findPendingOtpByEmail(email)).thenReturn(Optional.of(otp));

            // When
            OtpVerification result = otpService.getLatestPendingOtp(email);

            // Then
            assertThat(result).isNotNull();
            assertThat(result).isEqualTo(otp);
        }

        @Test
        @DisplayName("devrait retourner null si aucun OTP en attente")
        void getLatestPendingOtp_withNoOtp_shouldReturnNull() {
            // Given
            String email = "test@example.com";
            when(otpRepository.findPendingOtpByEmail(email)).thenReturn(Optional.empty());

            // When
            OtpVerification result = otpService.getLatestPendingOtp(email);

            // Then
            assertThat(result).isNull();
        }
    }

    @Nested
    @DisplayName("Increment Attempts Tests")
    class IncrementAttemptsTests {

        @Test
        @DisplayName("devrait incrémenter les tentatives")
        void incrementAttempts_withValidOtp_shouldIncrementAttempts() {
            // Given
            String email = "test@example.com";
            String code = "123456";
            OtpVerification otp = TestDataBuilder.buildOtp(email, code, OtpType.EMAIL_VERIFICATION);
            int initialAttempts = otp.getAttempts();

            when(otpRepository.findValidOtpByEmailAndCode(eq(email), eq(code), any(LocalDateTime.class)))
                    .thenReturn(Optional.of(otp));

            // When
            otpService.incrementAttempts(email, code);

            // Then
            verify(otpRepository).save(otpCaptor.capture());
            assertThat(otpCaptor.getValue().getAttempts()).isEqualTo(initialAttempts + 1);
        }

        @Test
        @DisplayName("ne devrait rien faire si OTP non trouvé")
        void incrementAttempts_withNoOtp_shouldDoNothing() {
            // Given
            String email = "test@example.com";
            String code = "999999";
            when(otpRepository.findValidOtpByEmailAndCode(eq(email), eq(code), any(LocalDateTime.class)))
                    .thenReturn(Optional.empty());

            // When
            otpService.incrementAttempts(email, code);

            // Then
            verify(otpRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("Cleanup Expired OTPs Tests")
    class CleanupExpiredOtpsTests {

        @Test
        @DisplayName("devrait nettoyer les OTP expirés")
        void cleanupExpiredOtps_shouldDeleteExpiredOtps() {
            // Given
            when(otpRepository.deleteExpiredOtps(any(LocalDateTime.class))).thenReturn(10);

            // When
            int result = otpService.cleanupExpiredOtps();

            // Then
            assertThat(result).isEqualTo(10);
            verify(otpRepository).deleteExpiredOtps(any(LocalDateTime.class));
        }

        @Test
        @DisplayName("devrait retourner 0 si aucun OTP à nettoyer")
        void cleanupExpiredOtps_withNoExpiredOtps_shouldReturnZero() {
            // Given
            when(otpRepository.deleteExpiredOtps(any(LocalDateTime.class))).thenReturn(0);

            // When
            int result = otpService.cleanupExpiredOtps();

            // Then
            assertThat(result).isEqualTo(0);
        }
    }

    // =========================================================================
    // Tests additionnels — branches non couvertes
    // =========================================================================

    @Nested
    @DisplayName("Generate And Send OTP — branches additionnelles")
    class GenerateAndSendOtpAdditionalTests {

        @Test
        @DisplayName("devrait envoyer l'email de réinitialisation pour un OTP PASSWORD_RESET")
        void generateAndSendOtp_withPasswordReset_shouldSendResetEmail() {
            // Given
            String email = "reset@example.com";
            String firstName = "Reset";
            when(otpRepository.countRecentOtpAttempts(eq(email), any(LocalDateTime.class))).thenReturn(0L);
            when(otpRepository.save(any(OtpVerification.class))).thenAnswer(i -> i.getArgument(0));

            // When
            OtpVerification result = otpService.generateAndSendOtp(
                    email, firstName, OtpType.PASSWORD_RESET, 42L, "kc-reset", null);

            // Then
            assertThat(result.getOtpType()).isEqualTo(OtpType.PASSWORD_RESET);
            assertThat(result.getUserId()).isEqualTo(42L);
            assertThat(result.getPlanType()).isNull();
            verify(emailService).sendResetPasswordEmail(eq(email), anyString(), eq(firstName));
            verify(emailService, never()).sendOtpEmail(any(), any(), any());
        }

        @Test
        @DisplayName("devrait générer un code OTP à 6 chiffres numériques")
        void generateAndSendOtp_shouldGenerateSixDigitNumericCode() {
            // Given
            String email = "digits@example.com";
            when(otpRepository.countRecentOtpAttempts(eq(email), any(LocalDateTime.class))).thenReturn(0L);
            when(otpRepository.save(any(OtpVerification.class))).thenAnswer(i -> i.getArgument(0));

            // When
            OtpVerification result = otpService.generateAndSendOtp(
                    email, "Test", OtpType.EMAIL_VERIFICATION, null, "kc", PlanType.FREE);

            // Then
            assertThat(result.getOtpCode()).matches("\\d{6}");
        }
    }

    @Nested
    @DisplayName("Verify OTP With Type Tests")
    class VerifyOtpWithTypeTests {

        @Test
        @DisplayName("devrait vérifier OTP avec type correspondant")
        void verifyOtpWithType_withMatchingType_shouldReturnTrue() {
            // Given
            String email = "type@example.com";
            String code = "123456";
            OtpVerification otp = TestDataBuilder.buildOtp(email, code, OtpType.PASSWORD_RESET);

            when(otpRepository.findValidOtpByEmailAndCode(eq(email), eq(code), any(LocalDateTime.class)))
                    .thenReturn(Optional.of(otp));
            when(otpRepository.save(any(OtpVerification.class))).thenReturn(otp);

            // When
            boolean result = otpService.verifyOtpWithType(email, code, OtpType.PASSWORD_RESET);

            // Then
            assertThat(result).isTrue();
            verify(otpRepository).save(otpCaptor.capture());
            assertThat(otpCaptor.getValue().getOtpStatus()).isEqualTo(OtpStatus.VERIFIED);
        }

        @Test
        @DisplayName("devrait retourner false si le type ne correspond pas")
        void verifyOtpWithType_withWrongType_shouldReturnFalse() {
            // Given
            String email = "type@example.com";
            String code = "123456";
            OtpVerification otp = TestDataBuilder.buildOtp(email, code, OtpType.EMAIL_VERIFICATION);

            when(otpRepository.findValidOtpByEmailAndCode(eq(email), eq(code), any(LocalDateTime.class)))
                    .thenReturn(Optional.of(otp));

            // When
            boolean result = otpService.verifyOtpWithType(email, code, OtpType.PASSWORD_RESET);

            // Then
            assertThat(result).isFalse();
            verify(otpRepository, never()).save(any());
        }

        @Test
        @DisplayName("devrait retourner false si aucun OTP valide trouvé")
        void verifyOtpWithType_withNoOtp_shouldReturnFalse() {
            // Given
            String email = "type@example.com";
            String code = "999999";
            when(otpRepository.findValidOtpByEmailAndCode(eq(email), eq(code), any(LocalDateTime.class)))
                    .thenReturn(Optional.empty());

            // When
            boolean result = otpService.verifyOtpWithType(email, code, OtpType.EMAIL_VERIFICATION);

            // Then
            assertThat(result).isFalse();
        }

        @Test
        @DisplayName("devrait retourner false si le code ne peut pas être validé (max tentatives)")
        void verifyOtpWithType_whenCannotBeValidated_shouldReturnFalse() {
            // Given
            String email = "locked@example.com";
            String code = "123456";
            OtpVerification otp = TestDataBuilder.buildOtp(email, code, OtpType.EMAIL_VERIFICATION);
            otp.setAttempts(5); // atteint maxAttempts (5) → canBeValidated() == false

            when(otpRepository.findValidOtpByEmailAndCode(eq(email), eq(code), any(LocalDateTime.class)))
                    .thenReturn(Optional.of(otp));
            when(otpRepository.save(any(OtpVerification.class))).thenReturn(otp);

            // When
            boolean result = otpService.verifyOtpWithType(email, code, OtpType.EMAIL_VERIFICATION);

            // Then
            assertThat(result).isFalse();
            verify(otpRepository).save(any(OtpVerification.class));
        }
    }

    @Nested
    @DisplayName("Verify OTP — branche impossible à valider")
    class VerifyOtpCannotBeValidatedTests {

        @Test
        @DisplayName("devrait retourner false si le code a atteint le max de tentatives")
        void verifyOtp_whenMaxAttemptsReached_shouldReturnFalse() {
            // Given
            String email = "locked@example.com";
            String code = "123456";
            OtpVerification otp = TestDataBuilder.buildOtp(email, code, OtpType.EMAIL_VERIFICATION);
            otp.setAttempts(5);

            when(otpRepository.findValidOtpByEmailAndCode(eq(email), eq(code), any(LocalDateTime.class)))
                    .thenReturn(Optional.of(otp));
            when(otpRepository.save(any(OtpVerification.class))).thenReturn(otp);

            // When
            boolean result = otpService.verifyOtp(email, code);

            // Then
            assertThat(result).isFalse();
            verify(otpRepository).save(any(OtpVerification.class));
        }
    }

    @Nested
    @DisplayName("Verify OTP And Get Details — branches additionnelles")
    class VerifyOtpAndGetDetailsAdditionalTests {

        @Test
        @DisplayName("devrait retourner null si l'OTP est expiré")
        void verifyOtpAndGetDetails_withExpiredOtp_shouldReturnNull() {
            // Given
            String email = "exp@example.com";
            String code = "123456";
            OtpVerification otp = TestDataBuilder.buildExpiredOtp();
            otp.setEmail(email);
            otp.setOtpCode(code);

            when(otpRepository.findPendingOtpByEmail(email)).thenReturn(Optional.of(otp));

            // When
            OtpVerification result = otpService.verifyOtpAndGetDetails(email, code);

            // Then
            assertThat(result).isNull();
            verify(otpRepository, never()).save(any());
        }

        @Test
        @DisplayName("devrait retourner null si le max de tentatives est atteint")
        void verifyOtpAndGetDetails_withMaxAttempts_shouldReturnNull() {
            // Given
            String email = "max@example.com";
            String code = "123456";
            OtpVerification otp = TestDataBuilder.buildOtp(email, code, OtpType.EMAIL_VERIFICATION);
            otp.setAttempts(5);

            when(otpRepository.findPendingOtpByEmail(email)).thenReturn(Optional.of(otp));

            // When
            OtpVerification result = otpService.verifyOtpAndGetDetails(email, code);

            // Then
            assertThat(result).isNull();
            verify(otpRepository, never()).save(any());
        }

        @Test
        @DisplayName("devrait incrémenter les tentatives et retourner null si le code est incorrect")
        void verifyOtpAndGetDetails_withWrongCode_shouldIncrementAndReturnNull() {
            // Given
            String email = "wrong@example.com";
            OtpVerification otp = TestDataBuilder.buildOtp(email, "123456", OtpType.EMAIL_VERIFICATION);

            when(otpRepository.findPendingOtpByEmail(email)).thenReturn(Optional.of(otp));
            when(otpRepository.save(any(OtpVerification.class))).thenReturn(otp);

            // When
            OtpVerification result = otpService.verifyOtpAndGetDetails(email, "000000");

            // Then
            assertThat(result).isNull();
            verify(otpRepository).save(otpCaptor.capture());
            assertThat(otpCaptor.getValue().getAttempts()).isEqualTo(1);
            assertThat(otpCaptor.getValue().getOtpStatus()).isEqualTo(OtpStatus.PENDING);
        }

        @ParameterizedTest(name = "code invalide « {0} » → null + tentative incrémentée")
        @ValueSource(strings = {"111111", "abcdef", "12345", "123-45", "0000000"})
        @DisplayName("devrait rejeter les codes mal formés ou incorrects")
        void verifyOtpAndGetDetails_withBadCodeShapes_shouldReturnNull(String badCode) {
            // Given — l'OTP réel attend "654321"
            String email = "shape@example.com";
            OtpVerification otp = TestDataBuilder.buildOtp(email, "654321", OtpType.EMAIL_VERIFICATION);

            when(otpRepository.findPendingOtpByEmail(email)).thenReturn(Optional.of(otp));
            lenient().when(otpRepository.save(any(OtpVerification.class))).thenReturn(otp);

            // When
            OtpVerification result = otpService.verifyOtpAndGetDetails(email, badCode);

            // Then
            assertThat(result).isNull();
        }
    }

    @Nested
    @DisplayName("Invalidate All Pending OTPs Tests")
    class InvalidateAllPendingOtpsTests {

        @Test
        @DisplayName("devrait déléguer l'invalidation au repository")
        void invalidateAllPendingOtps_shouldCallRepository() {
            // Given
            String email = "inval@example.com";
            when(otpRepository.expireAllPendingOtpsByEmail(email)).thenReturn(2);

            // When
            otpService.invalidateAllPendingOtps(email);

            // Then
            verify(otpRepository).expireAllPendingOtpsByEmail(email);
        }
    }

    @Nested
    @DisplayName("Get Latest OTP Tests")
    class GetLatestOtpTests {

        @Test
        @DisplayName("devrait retourner le dernier OTP peu importe le statut")
        void getLatestOtp_withExistingOtp_shouldReturnOtp() {
            // Given
            String email = "latest@example.com";
            OtpVerification otp = TestDataBuilder.buildOtp();
            when(otpRepository.findLatestOtpByEmail(email)).thenReturn(Optional.of(otp));

            // When
            OtpVerification result = otpService.getLatestOtp(email);

            // Then
            assertThat(result).isEqualTo(otp);
        }

        @Test
        @DisplayName("devrait retourner null si aucun OTP")
        void getLatestOtp_withNoOtp_shouldReturnNull() {
            // Given
            String email = "latest@example.com";
            when(otpRepository.findLatestOtpByEmail(email)).thenReturn(Optional.empty());

            // When
            OtpVerification result = otpService.getLatestOtp(email);

            // Then
            assertThat(result).isNull();
        }
    }
}
