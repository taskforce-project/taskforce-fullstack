package com.taskforce.tf_api.core.security;

import org.springframework.context.annotation.Profile;
import org.springframework.security.web.webauthn.api.Bytes;
import org.springframework.security.web.webauthn.api.ImmutablePublicKeyCredentialUserEntity;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialUserEntity;
import org.springframework.security.web.webauthn.management.PublicKeyCredentialUserEntityRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;

import lombok.RequiredArgsConstructor;

/**
 * Comptes TaskForce vus par WebAuthn : le nom est l'adresse du compte (celle que le gestionnaire de passkeys affiche),
 * l'identifiant est {@code users.passkey_handle}, tiré au hasard à la première passkey et stable si l'adresse change.
 * Il n'y a pas de table séparée de « comptes WebAuthn » : Spring Security la lit et l'écrit ici.
 */
@Component
@Profile("!desktop")
@RequiredArgsConstructor
public class PasskeyUserEntities implements PublicKeyCredentialUserEntityRepository {

    private final UserRepository userRepository;

    @Override
    public PublicKeyCredentialUserEntity findById(Bytes id) {
        if (id == null) {
            return null;
        }
        return userRepository.findByPasskeyHandle(id.toBase64UrlString()).map(PasskeyUserEntities::entity).orElse(null);
    }

    /** {@code username} est l'adresse du compte (cf. {@code PasskeyService}). Sans passkey encore, rien. */
    @Override
    public PublicKeyCredentialUserEntity findByUsername(String username) {
        if (username == null) {
            return null;
        }
        return userRepository.findByEmail(username)
            .filter(user -> user.getPasskeyHandle() != null)
            .map(PasskeyUserEntities::entity)
            .orElse(null);
    }

    /** Spring Security tire l'identifiant à la première passkey ; il est gardé une fois pour toutes sur le compte. */
    @Override
    @Transactional
    public void save(PublicKeyCredentialUserEntity entity) {
        userRepository.findByEmail(entity.getName())
            .filter(user -> user.getPasskeyHandle() == null)
            .ifPresent(user -> {
                user.setPasskeyHandle(entity.getId().toBase64UrlString());
                userRepository.save(user);
            });
    }

    /** L'identifiant reste au compte : ses passkeys se retirent une à une (et toutes avec le compte). */
    @Override
    public void delete(Bytes id) {
        // Rien à faire : voir la Javadoc.
    }

    static PublicKeyCredentialUserEntity entity(User user) {
        String display = user.getDisplayName() == null || user.getDisplayName().isBlank()
            ? user.getEmail()
            : user.getDisplayName();
        return ImmutablePublicKeyCredentialUserEntity.builder()
            .name(user.getEmail())
            .id(Bytes.fromBase64(user.getPasskeyHandle()))
            .displayName(display)
            .build();
    }
}
