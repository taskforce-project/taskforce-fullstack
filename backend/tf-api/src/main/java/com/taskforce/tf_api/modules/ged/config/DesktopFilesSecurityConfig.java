package com.taskforce.tf_api.modules.ged.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

import com.taskforce.tf_api.modules.ged.service.LocalObjectStorage;

/**
 * App desktop : les liens signés des fichiers ({@link LocalObjectStorage}) se passent de jeton, comme les liens
 * présignés de MinIO. Chaîne prioritaire sur les chaînes de {@code SecurityConfig} ; la signature est vérifiée par
 * {@code DesktopObjectController}.
 */
@Configuration
@Profile("desktop")
public class DesktopFilesSecurityConfig {

    @Bean
    @Order(-1)
    public SecurityFilterChain desktopSignedFilesFilterChain(HttpSecurity http) throws Exception {
        http
            .securityMatcher(LocalObjectStorage.OBJECT_ROUTE)
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(authz -> authz.anyRequest().permitAll());
        return http.build();
    }
}
