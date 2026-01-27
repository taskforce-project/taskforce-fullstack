package com.taskforce.tf_api.shared.config;

import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration OTP (One-Time Password)
 * Paramètres pour la génération et validation des codes OTP
 */
@Getter
@Configuration
public class OtpConfig {

    @Value("${otp.expiration-minutes}")
    private int expirationMinutes;

    @Value("${otp.length}")
    private int length;
}
