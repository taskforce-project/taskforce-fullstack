package com.taskforce.tf_api.core.service;

import com.taskforce.tf_api.core.dto.request.UpdateUserRequest;
import com.taskforce.tf_api.core.dto.response.UserResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service pour les opérations sur l'utilisateur courant.
 * Complète AuthService (qui gère l'authentification) en se concentrant sur le profil.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {

    private final UserRepository userRepository;
    private final KeycloakService keycloakService;

    /**
     * Récupère le profil complet de l'utilisateur par son keycloakId.
     * Enrichit les données DB avec les infos Keycloak (firstName, lastName).
     */
    @Transactional(readOnly = true)
    public UserResponse getByKeycloakId(String keycloakId) {
        User user = userRepository.findByKeycloakId(keycloakId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        UserRepresentation keycloakUser = keycloakService.getUserById(keycloakId);

        return buildUserResponse(user, keycloakUser);
    }

    /**
     * Met à jour le displayName et/ou l'avatarUrl de l'utilisateur courant.
     * Seuls les champs non-null de la requête sont appliqués (patch partiel).
     */
    @Transactional
    public UserResponse updateUser(String keycloakId, UpdateUserRequest request) {
        User user = userRepository.findByKeycloakId(keycloakId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        // Patch partiel : uniquement les champs fournis
        if (request.getDisplayName() != null) {
            user.setDisplayName(request.getDisplayName());
        }
        if (request.getAvatarUrl() != null) {
            user.setAvatarUrl(request.getAvatarUrl());
        }

        userRepository.save(user);
        log.info("Profil mis à jour pour keycloakId={}", keycloakId);

        UserRepresentation keycloakUser = keycloakService.getUserById(keycloakId);
        return buildUserResponse(user, keycloakUser);
    }

    /**
     * Construit un UserResponse depuis l'entité User + UserRepresentation Keycloak.
     * displayName : valeur personnalisée si définie, sinon "Prénom NOM" depuis Keycloak.
     */
    private UserResponse buildUserResponse(User user, UserRepresentation keycloakUser) {
        String computedDisplayName = (user.getDisplayName() != null && !user.getDisplayName().isBlank())
            ? user.getDisplayName()
            : keycloakUser.getFirstName() + " " + keycloakUser.getLastName().toUpperCase();

        return UserResponse.builder()
            .id(user.getId())
            .keycloakId(user.getKeycloakId())
            .email(user.getEmail())
            .firstName(keycloakUser.getFirstName())
            .lastName(keycloakUser.getLastName())
            .displayName(computedDisplayName)
            .avatarUrl(user.getAvatarUrl())
            .planType(user.getPlanType())
            .planStatus(user.getPlanStatus())
            .subscriptionStartDate(user.getSubscriptionStartDate())
            .subscriptionEndDate(user.getSubscriptionEndDate())
            .trialEndDate(user.getTrialEndDate())
            .isActive(user.getIsActive())
            .createdAt(user.getCreatedAt())
            .build();
    }
}
