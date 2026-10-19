package com.taskforce.tf_api.core.desktop;

import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.taskforce.tf_api.core.service.KeycloakService;
import com.taskforce.tf_api.shared.exception.BusinessException;

import lombok.RequiredArgsConstructor;

/**
 * Annuaire de l'app desktop : il ne connaît que le compte TaskForce connecté dans la coque, et ne joint jamais
 * Keycloak (l'app marche hors ligne). Lire ce compte marche comme sur le serveur ; ce qui modifie le compte
 * lui-même (nom, mot de passe, suppression) se fait sur la page du compte hébergé, pas dans l'app.
 */
@Service
@Profile("desktop")
@RequiredArgsConstructor
public class DesktopAccountDirectory implements KeycloakService {

    static final String MANAGED_ON_ACCOUNT =
        "This is managed on your TaskForce account page, not in the desktop app.";

    private final DesktopProperties properties;

    @Override
    public UserRepresentation getUserById(String keycloakId) {
        if (!account().subject().equals(keycloakId)) {
            throw new RuntimeException("User not found: " + keycloakId);
        }
        return representation();
    }

    @Override
    public UserRepresentation getUserByEmail(String email) {
        if (!emailExists(email)) {
            throw new RuntimeException("User not found: " + email);
        }
        return representation();
    }

    @Override
    public boolean emailExists(String email) {
        return email != null && account().email().equalsIgnoreCase(email.trim());
    }

    @Override
    public String createUser(String email, String password, String firstName, String lastName) {
        throw new BusinessException(MANAGED_ON_ACCOUNT);
    }

    @Override
    public void verifyEmail(String keycloakId) {
        throw new BusinessException(MANAGED_ON_ACCOUNT);
    }

    @Override
    public void updatePassword(String keycloakId, String newPassword) {
        throw new BusinessException(MANAGED_ON_ACCOUNT);
    }

    @Override
    public void setUserEnabled(String keycloakId, boolean enabled) {
        throw new BusinessException(MANAGED_ON_ACCOUNT);
    }

    @Override
    public void updateUserNames(String keycloakId, String firstName, String lastName) {
        throw new BusinessException(MANAGED_ON_ACCOUNT);
    }

    @Override
    public void deleteUser(String keycloakId) {
        throw new BusinessException(MANAGED_ON_ACCOUNT);
    }

    /** Rien à fermer : les sessions du compte vivent du côté hébergé, la coque oublie les siennes. */
    @Override
    public void logoutUser(String keycloakId) {
        // no-op
    }

    private DesktopProperties.Account account() {
        return properties.account();
    }

    private UserRepresentation representation() {
        DesktopProperties.Account account = account();
        UserRepresentation user = new UserRepresentation();
        user.setId(account.subject());
        user.setEmail(account.email());
        user.setUsername(account.email());
        user.setFirstName(account.givenName());
        user.setLastName(account.familyName());
        user.setEnabled(true);
        user.setEmailVerified(true);
        return user;
    }
}
