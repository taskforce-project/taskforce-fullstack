package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("EmailService Tests")
class EmailServiceTest {

    @Mock
    private JavaMailSender mailSender;

    @InjectMocks
    private EmailService emailService;

    @Captor
    private ArgumentCaptor<SimpleMailMessage> messageCaptor;

    @BeforeEach
    void setup() {
        ReflectionTestUtils.setField(emailService, "fromEmail", "noreply@taskforce.com");
        ReflectionTestUtils.setField(emailService, "fromName", "TaskForce");
    }

    @Nested
    @DisplayName("Send OTP Email Tests")
    class SendOtpEmailTests {

        @Test
        @DisplayName("devrait envoyer email OTP avec succès")
        void sendOtpEmail_withValidData_shouldSendEmail() {
            // Given
            String toEmail = "test@example.com";
            String otpCode = "123456";
            String firstName = "John";

            doNothing().when(mailSender).send(any(SimpleMailMessage.class));

            // When
            emailService.sendOtpEmail(toEmail, otpCode, firstName);

            // Then
            verify(mailSender).send(messageCaptor.capture());
            SimpleMailMessage sentMessage = messageCaptor.getValue();

            assertThat(sentMessage.getTo()).containsExactly(toEmail);
            assertThat(sentMessage.getFrom()).isEqualTo("noreply@taskforce.com");
            assertThat(sentMessage.getSubject()).contains("TaskForce").contains("code de vérification");
            assertThat(sentMessage.getText())
                    .contains(firstName)
                    .contains(otpCode)
                    .contains("15 minutes");
        }

        @Test
        @DisplayName("devrait inclure le code OTP dans le corps de l'email")
        void sendOtpEmail_shouldIncludeOtpCodeInBody() {
            // Given
            String toEmail = "test@example.com";
            String otpCode = "987654";
            String firstName = "Jane";

            // When
            emailService.sendOtpEmail(toEmail, otpCode, firstName);

            // Then
            verify(mailSender).send(messageCaptor.capture());
            assertThat(messageCaptor.getValue().getText()).contains(otpCode);
        }

        @Test
        @DisplayName("devrait lancer exception si erreur d'envoi")
        void sendOtpEmail_withMailError_shouldThrowException() {
            // Given
            String toEmail = "test@example.com";
            doThrow(new RuntimeException("Mail server error"))
                    .when(mailSender).send(any(SimpleMailMessage.class));

            // When/Then
            assertThatThrownBy(() -> emailService.sendOtpEmail(toEmail, "123456", "John"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Erreur lors de l'envoi de l'email");
        }
    }

    @Nested
    @DisplayName("Send Welcome Email Tests")
    class SendWelcomeEmailTests {

        @Test
        @DisplayName("devrait envoyer email de bienvenue avec succès")
        void sendWelcomeEmail_withValidData_shouldSendEmail() {
            // Given
            String toEmail = "test@example.com";
            String firstName = "John";

            doNothing().when(mailSender).send(any(SimpleMailMessage.class));

            // When
            emailService.sendWelcomeEmail(toEmail, firstName);

            // Then
            verify(mailSender).send(messageCaptor.capture());
            SimpleMailMessage sentMessage = messageCaptor.getValue();

            assertThat(sentMessage.getTo()).containsExactly(toEmail);
            assertThat(sentMessage.getFrom()).isEqualTo("noreply@taskforce.com");
            assertThat(sentMessage.getSubject()).contains("Bienvenue").contains("TaskForce");
            assertThat(sentMessage.getText()).contains(firstName);
        }

        @Test
        @DisplayName("devrait gérer l'erreur silencieusement")
        void sendWelcomeEmail_withMailError_shouldNotThrowException() {
            // Given
            String toEmail = "test@example.com";
            doThrow(new RuntimeException("Mail server error"))
                    .when(mailSender).send(any(SimpleMailMessage.class));

            // When/Then - ne devrait pas lancer d'exception
            emailService.sendWelcomeEmail(toEmail, "John");

            verify(mailSender).send(any(SimpleMailMessage.class));
        }
    }

    @Nested
    @DisplayName("Send Subscription Confirmation Email Tests")
    class SendSubscriptionConfirmationEmailTests {

        @Test
        @DisplayName("devrait envoyer email de confirmation d'abonnement")
        void sendSubscriptionConfirmationEmail_withValidData_shouldSendEmail() {
            // Given
            String toEmail = "test@example.com";
            String firstName = "John";
            String planType = "PREMIUM";

            doNothing().when(mailSender).send(any(SimpleMailMessage.class));

            // When
            emailService.sendSubscriptionConfirmationEmail(toEmail, firstName, planType);

            // Then
            verify(mailSender).send(messageCaptor.capture());
            SimpleMailMessage sentMessage = messageCaptor.getValue();

            assertThat(sentMessage.getTo()).containsExactly(toEmail);
            assertThat(sentMessage.getSubject()).contains("Confirmation").contains("abonnement");
            assertThat(sentMessage.getText())
                    .contains(firstName)
                    .contains(planType);
        }

        @Test
        @DisplayName("devrait gérer l'erreur silencieusement")
        void sendSubscriptionConfirmationEmail_withMailError_shouldNotThrowException() {
            // Given
            String toEmail = "test@example.com";
            doThrow(new RuntimeException("Mail server error"))
                    .when(mailSender).send(any(SimpleMailMessage.class));

            // When/Then - ne devrait pas lancer d'exception
            emailService.sendSubscriptionConfirmationEmail(toEmail, "John", "PREMIUM");

            verify(mailSender).send(any(SimpleMailMessage.class));
        }

        @Test
        @DisplayName("devrait envoyer email pour différents plans")
        void sendSubscriptionConfirmationEmail_withDifferentPlans_shouldSendCorrectly() {
            // Given
            String toEmail = "test@example.com";
            String firstName = "John";

            // When - Test PREMIUM
            emailService.sendSubscriptionConfirmationEmail(toEmail, firstName, "PREMIUM");

            // Then
            verify(mailSender, times(1)).send(messageCaptor.capture());
            assertThat(messageCaptor.getValue().getText()).contains("PREMIUM");

            // When - Test ENTERPRISE
            emailService.sendSubscriptionConfirmationEmail(toEmail, firstName, "ENTERPRISE");

            // Then
            verify(mailSender, times(2)).send(messageCaptor.capture());
            assertThat(messageCaptor.getValue().getText()).contains("ENTERPRISE");
        }
    }
}

