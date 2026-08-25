package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.NotificationPreference;

/**
 * Accès aux préférences de notification (par utilisateur, par événement).
 */
@Repository
public interface NotificationPreferenceRepository extends JpaRepository<NotificationPreference, Long> {

    /** Toutes les préférences explicitement enregistrées par un utilisateur. */
    List<NotificationPreference> findByUserId(Long userId);

    /** Préférence d'un utilisateur pour un événement précis (peut être absente = défaut). */
    Optional<NotificationPreference> findByUserIdAndEventKey(Long userId, String eventKey);
}
