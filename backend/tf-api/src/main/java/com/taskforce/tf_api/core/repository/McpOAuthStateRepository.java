package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.model.McpOAuthState;

/**
 * Etats OAuth MCP ephemeres (TF-MCP-02). Cle = le {@code state} anti-CSRF. Une ligne vit entre le
 * clic (start) et le callback, puis est supprimee ; le balayage nettoie les expirees.
 */
public interface McpOAuthStateRepository extends JpaRepository<McpOAuthState, String> {

    /**
     * Purge des states expires, appelee par le {@link com.taskforce.tf_api.core.service.RetentionScheduler}.
     * {@code @Transactional} ici pour que le scheduler l'appelle hors transaction (comme OAuthStateRepository).
     */
    @Transactional
    long deleteByExpiresAtBefore(LocalDateTime cutoff);
}
