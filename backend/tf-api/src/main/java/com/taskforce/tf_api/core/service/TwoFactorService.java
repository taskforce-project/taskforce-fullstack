package com.taskforce.tf_api.core.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.UserTwoFactor;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.UserTwoFactorRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.security.TotpService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Double authentification. Elle se règle sur le compte en ligne (Keycloak : application d'authentification), qui demande
 * le code sur toutes les voies : webapp, app desktop, GitHub et Google (flux `tf-browser` et `tf-post-broker`, cf.
 * keycloak/scripts/two-step-flows.sh).
 *
 * <p>Le TOTP géré par l'application (V79), dont le secret vit dans notre base, n'est plus proposé : il reste vérifié à la
 * connexion pour un compte qui l'avait activé ({@link #verifyOrThrow}).</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TwoFactorService {

    private final UserRepository userRepository;
    private final UserTwoFactorRepository repository;
    private final TotpService totp;
    private final KeycloakService keycloakService;

    /**
     * Vrai si la connexion de ce compte demande un code : application d'authentification du compte en ligne, ou TOTP
     * de l'app pour un compte qui l'avait activé.
     */
    @Transactional(readOnly = true)
    public boolean isOnForAccount(String email) {
        return userRepository.findByEmail(email)
            .map(user -> repository.existsByUserIdAndEnabledTrue(user.getId()) || hasAccountOneTimeCode(user))
            .orElse(false);
    }

    private boolean hasAccountOneTimeCode(User user) {
        try {
            return user.getKeycloakId() != null && keycloakService.hasOneTimeCode(user.getKeycloakId());
        } catch (RuntimeException e) {
            log.warn("Application d'authentification du compte {} illisible : {}", user.getId(), e.getMessage());
            return false;
        }
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
            throw new BusinessException("Too many wrong codes. Wait a minute and try again");
        }
        UserTwoFactor row = repository.findByUserId(userId)
            .filter(UserTwoFactor::isEnabled)
            .orElseThrow(() -> new BusinessException("Two-factor authentication is not set up"));
        if (!totp.verify(row.getSecret(), code)) {
            totpFails.compute(userId, (k, v) ->
                (v == null || (now - v[1]) >= TOTP_WINDOW_MS) ? new long[]{1, now} : new long[]{v[0] + 1, v[1]});
            throw new BusinessException("Invalid authentication code");
        }
        totpFails.remove(userId); // succès → on oublie les échecs
    }
}
