package com.taskforce.tf_api.core.config;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.taskforce.tf_api.core.security.PersonalTokenScopeFilter;

/**
 * Retire {@link PersonalTokenScopeFilter} de la chaîne <b>servlet</b>, où Spring Boot enregistre d'office tout bean
 * {@code Filter} : il y tournerait avant l'authentification, sans principal. Sa place est celle que lui donne
 * {@code SecurityConfig}, juste après l'authentification du bearer.
 */
@Configuration
public class PersonalTokenScopeFilterConfig {

    @Bean
    public FilterRegistrationBean<PersonalTokenScopeFilter> personalTokenScopeFilterRegistration(PersonalTokenScopeFilter filter) {
        FilterRegistrationBean<PersonalTokenScopeFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }
}
