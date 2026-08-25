package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.UpdateNotificationPreferencesRequest;
import com.taskforce.tf_api.core.dto.response.NotificationPreferenceResponse;
import com.taskforce.tf_api.core.model.NotificationEvent;
import com.taskforce.tf_api.core.model.NotificationPreference;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.NotificationPreferenceRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Réglages de notification (par utilisateur, par événement) — portée compte.
 *
 * <p>Modèle « <b>absence = défaut</b> » : aucune ligne n'est seedée. La matrice complète est calculée
 * à la lecture en fusionnant les défauts ({@link #DEFAULT_CHANNELS}) avec les lignes enregistrées.
 * Une ligne n'est écrite que lorsqu'un réglage est explicitement modifié.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationPreferenceService {

    /** Canaux résolus pour un événement. */
    public record Channels(boolean inApp, boolean email) {}

    /** Défaut appliqué en l'absence de ligne : in-app actif, email opt-in (inactif). */
    private static final Channels DEFAULT_CHANNELS = new Channels(true, false);

    private final NotificationPreferenceRepository preferenceRepository;
    private final UserRepository userRepository;

    /**
     * Matrice complète des 6 événements, défauts fusionnés avec les réglages enregistrés.
     */
    @Transactional(readOnly = true)
    public List<NotificationPreferenceResponse> getPreferences(Long userId) {
        Map<String, NotificationPreference> stored = preferenceRepository.findByUserId(userId).stream()
            .collect(Collectors.toMap(NotificationPreference::getEventKey, p -> p, (a, b) -> a));

        List<NotificationPreferenceResponse> result = new ArrayList<>();
        for (NotificationEvent event : NotificationEvent.values()) {
            NotificationPreference pref = stored.get(event.key());
            result.add(NotificationPreferenceResponse.builder()
                .eventKey(event.key())
                .inApp(pref != null ? pref.isInApp() : DEFAULT_CHANNELS.inApp())
                .email(pref != null ? pref.isEmail() : DEFAULT_CHANNELS.email())
                .build());
        }
        return result;
    }

    /**
     * Upsert des réglages fournis. Les {@code eventKey} inconnus sont ignorés silencieusement.
     * Renvoie la matrice complète recalculée.
     */
    @Transactional
    public List<NotificationPreferenceResponse> updatePreferences(
            Long userId, UpdateNotificationPreferencesRequest request) {

        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        for (UpdateNotificationPreferencesRequest.Item item : request.getPreferences()) {
            Optional<NotificationEvent> resolved = NotificationEvent.fromKey(item.getEventKey());
            if (resolved.isEmpty()) {
                log.warn("Préférence de notification ignorée (event_key inconnu : {})", item.getEventKey());
                continue;
            }
            NotificationEvent event = resolved.get();
            NotificationPreference pref = preferenceRepository
                .findByUserIdAndEventKey(userId, event.key())
                .orElseGet(() -> NotificationPreference.builder()
                    .user(user)
                    .eventKey(event.key())
                    .build());
            pref.setInApp(Boolean.TRUE.equals(item.getInApp()));
            pref.setEmail(Boolean.TRUE.equals(item.getEmail()));
            preferenceRepository.save(pref);
        }
        return getPreferences(userId);
    }

    /**
     * Canaux effectifs pour une notification, avant persistance/push/email.
     * Événement inconnu -> défaut historique (in-app actif, email inactif) : jamais de régression.
     */
    @Transactional(readOnly = true)
    public Channels resolve(Long userId, Optional<NotificationEvent> event) {
        if (event.isEmpty()) return DEFAULT_CHANNELS;
        return preferenceRepository.findByUserIdAndEventKey(userId, event.get().key())
            .map(p -> new Channels(p.isInApp(), p.isEmail()))
            .orElse(DEFAULT_CHANNELS);
    }
}
