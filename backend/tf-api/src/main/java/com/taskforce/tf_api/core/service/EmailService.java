package com.taskforce.tf_api.core.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import com.taskforce.tf_api.shared.util.LogSafe;

/**
 * Service d'envoi d'emails avec templates HTML via Mailtrap (développement) ou SMTP
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;
    private final TemplateEngine templateEngine;

    @Value("${mail.host:}")
    private String mailHost;

    @Value("${mail.from:noreply@taskforce.com}")
    private String fromEmail;

    @Value("${mail.from-name:TaskForce}")
    private String fromName;

    @Value("${app.url:http://localhost:3000}")
    private String appUrl;

    /**
     * Envoie un code OTP par email
     */
    public void sendOtpEmail(String toEmail, String otpCode, String firstName) {
        try {
            Context context = new Context();
            context.setVariable("firstName", firstName);
            context.setVariable("otpCode", otpCode);
            
            String htmlContent = templateEngine.process("email/otp-email", context);
            
            sendHtmlEmail(
                toEmail, 
                String.format("[%s] Your verification code", fromName),
                htmlContent
            );
            
            log.info("OTP email envoyé avec succès à : {}", LogSafe.of(toEmail));
        } catch (Exception e) {
            log.error("Erreur lors de l'envoi de l'email OTP à {}: {}", LogSafe.of(toEmail), LogSafe.of(e.getMessage()));
            throw new RuntimeException("Error sending the email", e);
        }
    }

    /**
     * Envoie un email de bienvenue après inscription
     */
    public void sendWelcomeEmail(String toEmail, String firstName) {
        try {
            Context context = new Context();
            context.setVariable("firstName", firstName);
            context.setVariable("appUrl", appUrl);
            
            String htmlContent = templateEngine.process("email/welcome-email", context);
            
            sendHtmlEmail(
                toEmail,
                String.format("Welcome to %s!", fromName),
                htmlContent
            );
            
            log.info("Email de bienvenue envoyé à : {}", LogSafe.of(toEmail));
        } catch (Exception e) {
            log.error("Erreur lors de l'envoi de l'email de bienvenue à {}: {}", LogSafe.of(toEmail), LogSafe.of(e.getMessage()));
        }
    }

    /**
     * Envoie un email de réinitialisation de mot de passe
     */
    public void sendResetPasswordEmail(String toEmail, String otpCode, String firstName) {
        try {
            Context context = new Context();
            context.setVariable("firstName", firstName);
            context.setVariable("otpCode", otpCode);
            
            String htmlContent = templateEngine.process("email/reset-password-email", context);
            
            sendHtmlEmail(
                toEmail,
                String.format("[%s] Reset your password", fromName),
                htmlContent
            );
            
            log.info("Email de réinitialisation envoyé à : {}", LogSafe.of(toEmail));
        } catch (Exception e) {
            log.error("Erreur lors de l'envoi de l'email de réinitialisation à {}: {}", LogSafe.of(toEmail), LogSafe.of(e.getMessage()));
            throw new RuntimeException("Error sending the email", e);
        }
    }

    /**
     * Envoie une invitation à rejoindre un workspace (PROD-3.5). Best-effort :
     * en cas d'échec SMTP on logue sans propager (l'invitation reste créée en DB).
     */
    public void sendWorkspaceInvitationEmail(String toEmail, String inviterName,
                                             String workspaceName, String acceptUrl) {
        try {
            Context context = new Context();
            context.setVariable("inviterName", inviterName);
            context.setVariable("workspaceName", workspaceName);
            context.setVariable("acceptUrl", acceptUrl);

            String htmlContent = templateEngine.process("email/workspace-invitation-email", context);

            sendHtmlEmail(
                toEmail,
                String.format("[%s] You're invited to join %s", fromName, workspaceName),
                htmlContent
            );
            log.info("Email d'invitation workspace envoyé à : {}", LogSafe.of(toEmail));
        } catch (Exception e) {
            log.error("Échec de l'envoi de l'email d'invitation à {} : {}", LogSafe.of(toEmail), LogSafe.of(e.getMessage()));
        }
    }

    /**
     * SMTP réellement configuré ? En prod, {@code MAIL_HOST} peut être vide (« SMTP inactif ») :
     * dans ce cas les envois best-effort deviennent des no-op silencieux plutôt que des erreurs.
     */
    public boolean isEnabled() {
        return mailHost != null && !mailHost.isBlank();
    }

    /**
     * Email d'une notification produit (assignation, mention, commentaire, statut, échéance…).
     * Envoyé <b>uniquement si l'utilisateur a activé le canal email</b> pour cet événement
     * (gate côté {@link NotificationService}). Best-effort : jamais propagé (ne casse pas l'action
     * métier) et no-op si SMTP inactif. Le contenu (title/body) est en anglais, comme l'inbox in-app.
     */
    public void sendNotificationEmail(String toEmail, String recipientName, String eventLabel,
                                      String title, String body, String issueIdentifier, String relativeUrl) {
        if (!isEnabled()) return;
        try {
            Context context = new Context();
            context.setVariable("recipientName",
                (recipientName != null && !recipientName.isBlank()) ? recipientName : "there");
            context.setVariable("eventLabel", eventLabel);
            context.setVariable("title", title);
            context.setVariable("body", body);
            context.setVariable("issueIdentifier", issueIdentifier);
            context.setVariable("actionUrl", appUrl + (relativeUrl != null ? relativeUrl : ""));

            String htmlContent = templateEngine.process("email/notification-email", context);
            sendHtmlEmail(toEmail, String.format("[%s] %s", fromName, title), htmlContent);
            log.info("Notification email envoyé à : {}", toEmail);
        } catch (Exception e) {
            log.error("Échec de l'envoi de la notification email à {} : {}", toEmail, e.getMessage());
        }
    }

    private void sendHtmlEmail(String toEmail, String subject, String htmlContent) throws MessagingException {
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
        
        helper.setFrom(fromEmail);
        helper.setTo(toEmail);
        helper.setSubject(subject);
        helper.setText(htmlContent, true); // true = HTML
        
        mailSender.send(message);
    }
}
