package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.OAuthState;

public interface OAuthStateRepository extends JpaRepository<OAuthState, String> {

    /** Purge des states expirés (appelé opportunément à l'émission d'un nouveau state). */
    void deleteByExpiresAtBefore(LocalDateTime cutoff);
}
