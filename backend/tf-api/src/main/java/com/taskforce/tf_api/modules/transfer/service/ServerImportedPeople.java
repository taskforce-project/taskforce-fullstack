package com.taskforce.tf_api.modules.transfer.service;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;

import lombok.RequiredArgsConstructor;

/**
 * Sur le serveur : une personne du fichier est le membre de l'espace qui a la même adresse ; sinon, c'est la personne
 * qui importe. Aucun compte n'est créé : un compte inactif créé pour une adresse bloquerait sa future inscription.
 */
@Component
@Profile("!desktop")
@RequiredArgsConstructor
public class ServerImportedPeople implements ImportedPeople {

    private final UserRepository userRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;

    @Override
    public Long resolve(String email, String displayName, Long importerId, Long workspaceId) {
        if (email == null || email.isBlank()) {
            return importerId;
        }
        return userRepository.findByEmail(email.trim())
            .map(User::getId)
            .filter(id -> workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspaceId, id))
            .orElse(importerId);
    }
}
