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
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

import jakarta.mail.MessagingException;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("EmailService Tests")
class EmailServiceTest {

    @Mock
    private JavaMailSender mailSender;

    @Mock
    private TemplateEngine templateEngine;

    @InjectMocks
    private EmailService emailService;

    @Captor
    private ArgumentCaptor<MimeMessage> messageCaptor;

    private MimeMessage mimeMessage;

    @BeforeEach
    void setup() {
        ReflectionTestUtils.setField(emailService, "fromEmail", "noreply@taskforce.com");
        ReflectionTestUtils.setField(emailService, "fromName", "TaskForce");
        ReflectionTestUtils.setField(emailService, "appUrl", "http://localhost:3000");
        ReflectionTestUtils.setField(emailService, "supportUrl", "http://localhost:3000/support");
        ReflectionTestUtils.setField(emailService, "contactUrl", "http://localhost:3000/contact");
        
        // Créer un vrai MimeMessage pour les tests (lenient pour éviter les unnecessary stubbing)
        mimeMessage = new MimeMessage((Session) null);
        lenient().when(mailSender.createMimeMessage()).thenReturn(mimeMessage);
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
            String htmlContent = "<html><body>Your OTP: 123456</body></html>";

            when(templateEngine.process(eq("email/otp-email"), any(Context.class)))
                    .thenReturn(htmlContent);
            doNothing().when(mailSender).send(any(MimeMessage.class));

            // When
            emailService.sendOtpEmail(toEmail, otpCode, firstName);

            // Then
            verify(mailSender).send(any(MimeMessage.class));
            verify(templateEngine).process(eq("email/otp-email"), any(Context.class));
        }

        @Test
        @DisplayName("devrait utiliser le bon template Thymeleaf")
        void sendOtpEmail_shouldUseCorrectTemplate() {
            // Given
            String toEmail = "test@example.com";
            String otpCode = "987654";
            String firstName = "Jane";
            
            when(templateEngine.process(anyString(), any(Context.class)))
                    .thenReturn("<html>Template content</html>");

            // When
            emailService.sendOtpEmail(toEmail, otpCode, firstName);

            // Then
            verify(templateEngine).process(eq("email/otp-email"), any(Context.class));
        }

        @Test
        @DisplayName("devrait lancer exception si erreur Thymeleaf")
        void sendOtpEmail_withTemplateError_shouldThrowException() {
            // Given
            String toEmail = "test@example.com";
            when(templateEngine.process(anyString(), any(Context.class)))
                    .thenThrow(new RuntimeException("Template not found"));

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
            String firstName = "Alice";
            String htmlContent = "<html><body>Welcome Alice!</body></html>";

            when(templateEngine.process(eq("email/welcome-email"), any(Context.class)))
                    .thenReturn(htmlContent);
            doNothing().when(mailSender).send(any(MimeMessage.class));

            // When
            emailService.sendWelcomeEmail(toEmail, firstName);

            // Then
            verify(mailSender).send(any(MimeMessage.class));
            verify(templateEngine).process(eq("email/welcome-email"), any(Context.class));
        }

        @Test
        @DisplayName("devrait utiliser le bon template Thymeleaf")
        void sendWelcomeEmail_shouldUseCorrectTemplate() {
            // Given
            when(templateEngine.process(anyString(), any(Context.class)))
                    .thenReturn("<html>Welcome template</html>");

            // When
            emailService.sendWelcomeEmail("test@example.com", "Bob");

            // Then
            verify(templateEngine).process(eq("email/welcome-email"), any(Context.class));
        }
    }

    @Nested
    @DisplayName("Send Reset Password Email Tests")
    class SendResetPasswordEmailTests {

        @Test
        @DisplayName("devrait envoyer email reset password avec succès")
        void sendResetPasswordEmail_withValidData_shouldSendEmail() {
            // Given
            String toEmail = "test@example.com";
            String resetCode = "654321";
            String firstName = "Charlie";
            String htmlContent = "<html><body>Reset code: 654321</body></html>";

            when(templateEngine.process(eq("email/reset-password-email"), any(Context.class)))
                    .thenReturn(htmlContent);
            doNothing().when(mailSender).send(any(MimeMessage.class));

            // When
            emailService.sendResetPasswordEmail(toEmail, resetCode, firstName);

            // Then
            verify(mailSender).send(any(MimeMessage.class));
            verify(templateEngine).process(eq("email/reset-password-email"), any(Context.class));
        }

        @Test
        @DisplayName("devrait utiliser le bon template Thymeleaf")
        void sendResetPasswordEmail_shouldUseCorrectTemplate() {
            // Given
            when(templateEngine.process(anyString(), any(Context.class)))
                    .thenReturn("<html>Reset template</html>");

            // When
            emailService.sendResetPasswordEmail("test@example.com", "111111", "David");

            // Then
            verify(templateEngine).process(eq("email/reset-password-email"), any(Context.class));
        }

        @Test
        @DisplayName("devrait lancer exception si erreur d'envoi")
        void sendResetPasswordEmail_withMailError_shouldThrowException() {
            // Given
            String toEmail = "test@example.com";
            when(templateEngine.process(anyString(), any(Context.class)))
                    .thenReturn("<html>Content</html>");
            doThrow(new RuntimeException("Mail server error"))
                    .when(mailSender).send(any(MimeMessage.class));

            // When/Then
            assertThatThrownBy(() -> emailService.sendResetPasswordEmail(toEmail, "123", "Eve"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Erreur lors de l'envoi de l'email");
        }
    }
}
