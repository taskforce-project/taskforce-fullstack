package com.taskforce.tf_api.shared.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

/**
 * Configuration JPA et Auditing
 * Active l'auditing automatique des entités
 */
@Configuration
@EnableJpaAuditing
public class JpaConfig {
    // L'annotation @EnableJpaAuditing active l'auditing automatique
    // Les champs @CreatedDate, @LastModifiedDate, @CreatedBy, @LastModifiedBy
    // seront automatiquement remplis
}

