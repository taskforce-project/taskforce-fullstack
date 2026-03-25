package com.taskforce.tf_api.config;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

/**
 * Configuration de test commune
 */
@TestConfiguration
public class TestConfig {

    /**
     * Mock JavaMailSender pour les tests
     */
    @Bean
    @Primary
    public JavaMailSender javaMailSender() {
        return new JavaMailSenderImpl();
    }
}

