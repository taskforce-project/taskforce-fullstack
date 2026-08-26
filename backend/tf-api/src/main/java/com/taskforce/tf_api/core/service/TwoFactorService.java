package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.TwoFactorSetupResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.UserTwoFactor;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.UserTwoFactorRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.security.TotpService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 2FA (TOTP) <b>géré par l'application</b> — le secret vit dans notre DB, jamais dans Keycloak, et
 * l'utilisateur ne voit jamais de page hébergée par Keycloak.
 *
 * <p>Parcours : {@link #setup} génère un secret (inactif) + le QR → l'utilisateur scanne →
 * {@link #confirm} valide un 1er code et active. Au login, {@link #verifyOrThrow} exige un code
 * si {@link #isEnabled} — imposé côté backend, seul chemin d'authentification (client confidentiel).</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TwoFactorService {

    private static final String ISSUER = "TaskForce";

    private final UserRepository userRepository;
    private final UserTwoFactorRepository repository;
    private final TotpService totp;

    /** Démarre l'activation : (ré)génère un secret EN ATTENTE et renvoie le QR/URI à scanner. */
    @Transactional
    public TwoFactorSetupResponse setup(String email) {
        User user = requireUser(email);
        String secret = totp.generateSecret();
        UserTwoFactor row = repository.findByUserId(user.getId()).orElseGet(UserTwoFactor::new);
        row.setUserId(user.getId());
        row.setSecret(secret);
        row.setEnabled(false);
        row.setConfirmedAt(null);
        if (row.getCreatedAt() == null) {
            row.setCreatedAt(LocalDateTime.now());
        }
        repository.save(row);
        return TwoFactorSetupResponse.builder()
            .secret(secret)
            .otpauthUri(totp.buildUri(secret, email, ISSUER))
            .build();
    }

    /** Confirme l'activation : le 1er code valide passe le 2FA en actif. */
    @Transactional
    public void confirm(String email, String code) {
        User user = requireUser(email);
        UserTwoFactor row = repository.findByUserId(user.getId())
            .orElseThrow(() -> new BusinessException("Aucune activation 2FA en attente — relancez la configuration"));
        if (!totp.verify(row.getSecret(), code)) {
            throw new BusinessException("Code invalide — vérifiez l'heure de votre téléphone et réessayez");
        }
        row.setEnabled(true);
        row.setConfirmedAt(LocalDateTime.now());
        repository.save(row);
        log.info("2FA activé pour userId={}", user.getId());
    }

    /** Le 2FA est-il actif pour cet email ? */
    @Transactional(readOnly = true)
    public boolean isEnabled(String email) {
        return userRepository.findByEmail(email)
            .map(u -> repository.existsByUserIdAndEnabledTrue(u.getId()))
            .orElse(false);
    }

    /** Le 2FA est-il actif pour cet utilisateur (par id) ? */
    @Transactional(readOnly = true)
    public boolean isEnabled(Long userId) {
        return repository.existsByUserIdAndEnabledTrue(userId);
    }

    /**
     * Anti-brute-force sur la vérification TOTP : au-delà de {@link #MAX_TOTP_FAILS} codes erronés
     * dans {@link #TOTP_WINDOW_MS}, on bloque l'utilisateur le temps de la fenêtre. En mémoire — la
     * prod tourne sur une seule instance backend (à porter sur Redis si on scale horizontalement).
     */
    private static final int MAX_TOTP_FAILS = 6;
    private static final long TOTP_WINDOW_MS = 2 * 60 * 1000L;
    private final java.util.Map<Long, long[]> totpFails = new java.util.concurrent.ConcurrentHashMap<>();

    /** Au login : exige un code valide contre le secret actif. Lève {@link BusinessException} sinon. */
    @Transactional(readOnly = true)
    public void verifyOrThrow(Long userId, String code) {
        long now = System.currentTimeMillis();
        long[] f = totpFails.get(userId);
        if (f != null && f[0] >= MAX_TOTP_FAILS && (now - f[1]) < TOTP_WINDOW_MS) {
            throw new BusinessException("Trop de codes erronés. Patientez une minute et réessayez");
        }
        UserTwoFactor row = repository.findByUserId(userId)
            .filter(UserTwoFactor::isEnabled)
            .orElseThrow(() -> new BusinessException("2FA non configuré"));
        if (!totp.verify(row.getSecret(), code)) {
            totpFails.compute(userId, (k, v) ->
                (v == null || (now - v[1]) >= TOTP_WINDOW_MS) ? new long[]{1, now} : new long[]{v[0] + 1, v[1]});
            throw new BusinessException("Code d'authentification invalide");
        }
        totpFails.remove(userId); // succès → on oublie les échecs
    }

    /** Désactive le 2FA (supprime le secret). */
    @Transactional
    public void disable(String email) {
        User user = requireUser(email);
        repository.deleteByUserId(user.getId());
        log.info("2FA désactivé pour userId={}", user.getId());
    }

    private User requireUser(String email) {
        return userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }
}
