package com.taskforce.tf_api.core.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.McpOAuthRegistration;

/** Les inscriptions dynamiques de TaskForce, par émetteur et adresse de retour (V126). */
public interface McpOAuthRegistrationRepository extends JpaRepository<McpOAuthRegistration, Long> {

    Optional<McpOAuthRegistration> findByIssuerAndRedirectUri(String issuer, String redirectUri);

    void deleteByIssuerAndRedirectUri(String issuer, String redirectUri);
}
