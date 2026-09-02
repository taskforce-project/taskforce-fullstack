package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.McpOAuthState;

/**
 * Etats OAuth MCP ephemeres (TF-MCP-02). Cle = le {@code state} anti-CSRF. Une ligne vit entre le
 * clic (start) et le callback, puis est supprimee ; le balayage nettoie les expirees.
 */
public interface McpOAuthStateRepository extends JpaRepository<McpOAuthState, String> {

    /** Purge des states expires (balayage opportuniste). */
    long deleteByExpiresAtBefore(LocalDateTime cutoff);
}
