package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.model.OAuthState;

public interface OAuthStateRepository extends JpaRepository<OAuthState, String> {

    /**
     * Purge des states expirés.
     *
     * <p>Appelée à l'émission d'un nouveau state (nettoyage opportuniste) <b>et</b> par le
     * {@link com.taskforce.tf_api.core.service.RetentionScheduler}. Le nettoyage opportuniste seul
     * ne suffisait pas : un workspace qui ne reconnecte plus d'intégration conservait ses states
     * indéfiniment.</p>
     *
     * <p>{@code @Transactional} est porté ici pour que le scheduler puisse appeler la méthode hors
     * transaction ; les appelants déjà transactionnels rejoignent la transaction courante.</p>
     */
    @Transactional
    long deleteByExpiresAtBefore(LocalDateTime cutoff);
}
