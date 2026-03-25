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
     * Méthode privée pour envoyer un email HTML
     */
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
