package com.taskforce.tf_api.modules.transfer.service;

import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;

import lombok.RequiredArgsConstructor;

/**
 * Dans l'app desktop : une personne du fichier est l'utilisateur local qui a la même adresse (le compte connecté, ou
 * une personne déjà gardée par un import précédent) ; sinon, l'app garde son nom et son adresse dans un utilisateur
 * inactif, que rien ne peut connecter (seul le compte connecté ouvre l'app), pour que ses commentaires et ses tickets
 * restent à son nom.
 */
@Component
@Profile("desktop")
@RequiredArgsConstructor
public class DesktopImportedPeople implements ImportedPeople {

    /** Préfixe de l'identifiant de compte d'une personne gardée par un import : jamais celui d'un vrai compte. */
    static final String PLACEHOLDER_PREFIX = "imported:";

    private final UserRepository userRepository;

    @Override
    public Long resolve(String email, String displayName, Long importerId, Long workspaceId) {
        if (email == null || email.isBlank()) {
            return importerId;
        }
        String address = email.trim();
        return userRepository.findByEmail(address)
            .map(User::getId)
            .orElseGet(() -> userRepository.save(User.builder()
                .keycloakId(PLACEHOLDER_PREFIX + UUID.randomUUID())
                .email(address)
                .displayName(displayName == null || displayName.isBlank() ? address : displayName.trim())
                .isActive(false)
                .build()).getId());
    }
}
