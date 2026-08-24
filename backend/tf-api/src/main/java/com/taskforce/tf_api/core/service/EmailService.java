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

/**
 * Service d'envoi d'emails avec templates HTML via Mailtrap (développement) ou SMTP
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;
    private final TemplateEngine templateEngine;

    @Value("${mail.from:noreply@taskforce.com}")
    private String fromEmail;

    @Value("${mail.from-name:TaskForce}")
    private String fromName;

    @Value("${app.url:http://localhost:3000}")
    private String appUrl;

    @Value("${app.support-url:http://localhost:3000/support}")
    private String supportUrl;

    @Value("${app.contact-url:http://localhost:3000/contact}")
    private String contactUrl;

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
                String.format("[%s] Votre code de vérification", fromName),
                htmlContent
            );
            
            log.info("OTP email envoyé avec succès à : {}", toEmail);
        } catch (Exception e) {
            log.error("Erreur lors de l'envoi de l'email OTP à {}: {}", toEmail, e.getMessage());
            throw new RuntimeException("Erreur lors de l'envoi de l'email", e);
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
            context.setVariable("supportUrl", supportUrl);
            context.setVariable("contactUrl", contactUrl);
            
            String htmlContent = templateEngine.process("email/welcome-email", context);
            
            sendHtmlEmail(
                toEmail,
                String.format("Bienvenue sur %s !", fromName),
                htmlContent
            );
            
            log.info("Email de bienvenue envoyé à : {}", toEmail);
        } catch (Exception e) {
            log.error("Erreur lors de l'envoi de l'email de bienvenue à {}: {}", toEmail, e.getMessage());
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
                String.format("[%s] Réinitialisation de votre mot de passe", fromName),
                htmlContent
            );
            
            log.info("Email de réinitialisation envoyé à : {}", toEmail);
        } catch (Exception e) {
            log.error("Erreur lors de l'envoi de l'email de réinitialisation à {}: {}", toEmail, e.getMessage());
            throw new RuntimeException("Erreur lors de l'envoi de l'email", e);
        }
    }

    /**
     * Envoie une confirmation de demande RGPD (accès aux données ou suppression de compte)
     */
    public void sendDataRequestEmail(String toEmail, String firstName, String requestType) {
        try {
            boolean isDeletion = "DELETION".equalsIgnoreCase(requestType);
            String subject = isDeletion
                ? String.format("[%s] Confirmation de suppression de compte", fromName)
                : String.format("[%s] Confirmation de demande d'accès aux données", fromName);

            String actionLine = isDeletion
                ? "Votre compte a été désactivé et vos données seront supprimées dans 30 jours conformément au RGPD."
                : "Nous avons bien reçu votre demande. Vous recevrez une copie de vos données dans un délai de 30 jours.";
            String requestTypeLabel = isDeletion ? "Suppression de compte" : "Accès aux données";

            Context context = new Context();
            context.setVariable("firstName", firstName);
            context.setVariable("actionLine", actionLine);
            context.setVariable("requestTypeLabel", requestTypeLabel);

            String htmlContent = templateEngine.process("email/data-request-email", context);

            sendHtmlEmail(toEmail, subject, htmlContent);
            log.info("Email de demande RGPD ({}) envoyé à : {}", requestType, toEmail);
        } catch (Exception e) {
            log.error("Erreur lors de l'envoi de l'email RGPD à {}: {}", toEmail, e.getMessage());
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
                String.format("[%s] Vous êtes invité à rejoindre %s", fromName, workspaceName),
                htmlContent
            );
            log.info("Email d'invitation workspace envoyé à : {}", toEmail);
        } catch (Exception e) {
            log.error("Échec de l'envoi de l'email d'invitation à {} : {}", toEmail, e.getMessage());
        }
    }

    /**
     * Méthode privée pour envoyer un email HTML
     */
    /**
     * Envoi générique d'une notification interne (ex : équipe sales). Best-effort :
     * en cas d'échec on logue sans propager (ne casse jamais l'action métier appelante).
     */
    public void sendInternalNotification(String toEmail, String subject, String htmlContent) {
        try {
            sendHtmlEmail(toEmail, subject, htmlContent);
            log.info("Notification interne envoyée à : {}", toEmail);
        } catch (Exception e) {
            log.error("Échec de l'envoi de la notification interne à {} : {}", toEmail, e.getMessage());
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
