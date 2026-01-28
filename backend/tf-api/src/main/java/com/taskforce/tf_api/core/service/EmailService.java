package com.taskforce.tf_api.core.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 * Service d'envoi d'emails via Mailtrap (développement) ou SMTP
 * L'API Java envoie les emails, pas le frontend
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${spring.mail.from:noreply@taskforce.com}")
    private String fromEmail;

    @Value("${app.name:TaskForce}")
    private String appName;

    /**
     * Envoie un code OTP par email
     */
    public void sendOtpEmail(String toEmail, String otpCode, String firstName) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(toEmail);
            message.setSubject(String.format("[%s] Votre code de vérification", appName));
            message.setText(buildOtpEmailBody(otpCode, firstName));

            mailSender.send(message);
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
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(toEmail);
            message.setSubject(String.format("Bienvenue sur %s !", appName));
            message.setText(buildWelcomeEmailBody(firstName));

            mailSender.send(message);
            log.info("Email de bienvenue envoyé à : {}", toEmail);
        } catch (Exception e) {
            log.error("Erreur lors de l'envoi de l'email de bienvenue à {}: {}", toEmail, e.getMessage());
        }
    }

    /**
     * Envoie un email de confirmation d'abonnement
     */
    public void sendSubscriptionConfirmationEmail(String toEmail, String firstName, String planType) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(toEmail);
            message.setSubject(String.format("[%s] Confirmation de votre abonnement", appName));
            message.setText(buildSubscriptionConfirmationBody(firstName, planType));

            mailSender.send(message);
            log.info("Email de confirmation d'abonnement envoyé à : {}", toEmail);
        } catch (Exception e) {
            log.error("Erreur lors de l'envoi de l'email de confirmation à {}: {}", toEmail, e.getMessage());
        }
    }

    /**
     * Construit le corps de l'email OTP
     */
    private String buildOtpEmailBody(String otpCode, String firstName) {
        return String.format("""
            Bonjour %s,
            
            Votre code de vérification est :
            
            %s
            
            Ce code expire dans 15 minutes.
            
            Si vous n'avez pas demandé ce code, ignorez cet email.
            
            Cordialement,
            L'équipe %s
            """, firstName, otpCode, appName);
    }

    /**
     * Construit le corps de l'email de bienvenue
     */
    private String buildWelcomeEmailBody(String firstName) {
        return String.format("""
            Bonjour %s,
            
            Bienvenue sur %s !
            
            Votre compte a été créé avec succès. Vous pouvez maintenant vous connecter et profiter de toutes nos fonctionnalités.
            
            Cordialement,
            L'équipe %s
            """, firstName, appName, appName);
    }

    /**
     * Construit le corps de l'email de confirmation d'abonnement
     */
    private String buildSubscriptionConfirmationBody(String firstName, String planType) {
        return String.format("""
            Bonjour %s,
            
            Merci pour votre abonnement au plan %s !
            
            Votre paiement a été confirmé et votre abonnement est maintenant actif.
            
            Vous pouvez maintenant profiter de toutes les fonctionnalités premium.
            
            Cordialement,
            L'équipe %s
            """, firstName, planType, appName);
    }
}
