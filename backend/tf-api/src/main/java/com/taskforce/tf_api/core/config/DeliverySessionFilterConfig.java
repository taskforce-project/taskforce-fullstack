package com.taskforce.tf_api.core.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.taskforce.tf_api.core.security.DeliverySessionFilter;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerSettings;

/**
 * Retire {@link DeliverySessionFilter} de la chaîne <b>servlet</b>, où Spring Boot enregistre d'office tout
 * bean {@code Filter}. Il y tournerait AVANT l'authentification, donc sans principal, et une seconde fois
 * dans la chaîne de sécurité. Sa seule place est celle que lui donne {@code SecurityConfig} : juste après
 * l'authentification du bearer.
 */
@Configuration
@ConditionalOnProperty(name = LocalRunnerSettings.ENABLED_PROPERTY, havingValue = "true")
public class DeliverySessionFilterConfig {

    @Bean
    public FilterRegistrationBean<DeliverySessionFilter> deliverySessionFilterRegistration(DeliverySessionFilter filter) {
        FilterRegistrationBean<DeliverySessionFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }
}
