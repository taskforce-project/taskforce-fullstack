package com.taskforce.tf_api.shared.config;

import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import java.util.Properties;

/**
 * Configuration Mail (Mailtrap pour le développement)
 * Gestion de l'envoi d'emails (OTP, vérification, etc.)
 */
@Getter
@Configuration
public class MailConfig {

    @Value("${mail.host}")
    private String host;

    @Value("${mail.port}")
    private int port;

    @Value("${mail.username}")
    private String username;

    @Value("${mail.password}")
    private String password;

    @Value("${mail.from}")
    private String fromEmail;

    @Value("${mail.from-name}")
    private String fromName;

    @Value("${mail.properties.mail.smtp.auth}")
    private boolean smtpAuth;

    @Value("${mail.properties.mail.smtp.starttls.enable}")
    private boolean starttlsEnable;

    @Value("${mail.properties.mail.smtp.starttls.required}")
    private boolean starttlsRequired;

    @Value("${mail.properties.mail.debug:false}")
    private boolean debug;

    /**
     * Configuration du JavaMailSender
     */
    @Bean
    public JavaMailSender javaMailSender() {
        JavaMailSenderImpl mailSender = new JavaMailSenderImpl();

        mailSender.setHost(host);
        mailSender.setPort(port);
        mailSender.setUsername(username);
        mailSender.setPassword(password);

        Properties props = mailSender.getJavaMailProperties();
        props.put("mail.transport.protocol", "smtp");
        props.put("mail.smtp.auth", smtpAuth);
        props.put("mail.smtp.starttls.enable", starttlsEnable);
        props.put("mail.smtp.starttls.required", starttlsRequired);
        props.put("mail.debug", debug);

        return mailSender;
    }
}
