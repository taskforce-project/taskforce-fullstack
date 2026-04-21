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

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

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
     * Récupère le profil complet de l'utilisateur par son email (claim "sub" du JWT Keycloak).
     * Utilise l'UUID Keycloak stocké en DB pour enrichir avec les infos Keycloak.
     */
    @Transactional
    public UserResponse getByEmail(String email) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        UserRepresentation keycloakUser = keycloakService.getUserById(user.getKeycloakId());

        // Auto-sync displayName depuis Keycloak si absent en DB
        if (user.getDisplayName() == null || user.getDisplayName().isBlank()) {
            String fn = keycloakUser.getFirstName();
            String ln = keycloakUser.getLastName();
            String synced = buildRawDisplayName(fn, ln);
            if (synced != null) {
                user.setDisplayName(synced);
                log.info("displayName syncé depuis Keycloak pour {}", email);
            }
        }

        // Auto-génération de l'avatar DiceBear si absent en DB
        if (user.getAvatarUrl() == null || user.getAvatarUrl().isBlank()) {
            String seed = URLEncoder.encode(user.getEmail(), StandardCharsets.UTF_8);
            user.setAvatarUrl("https://api.dicebear.com/9.x/identicon/svg?seed=" + seed);
            log.info("avatarUrl généré et sauvegardé pour {}", email);
        }

        userRepository.save(user);
        return buildUserResponse(user, keycloakUser);
    }

    /**
     * Met à jour le displayName et/ou l'avatarUrl de l'utilisateur courant.
     * Lookup par email (claim "sub" du JWT), puis utilise l'UUID DB pour les calls Keycloak.
     */
    @Transactional
    public UserResponse updateUserByEmail(String email, UpdateUserRequest request) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        // Patch partiel champs DB
        if (request.getDisplayName() != null) {
            user.setDisplayName(request.getDisplayName());
        }
        if (request.getAvatarUrl() != null) {
            user.setAvatarUrl(request.getAvatarUrl());
        }

        userRepository.save(user);

        // Propagation des noms vers Keycloak si fournis
        String keycloakId = user.getKeycloakId();
        boolean namesChanged = request.getFirstName() != null || request.getLastName() != null;
        if (namesChanged) {
            keycloakService.updateUserNames(keycloakId, request.getFirstName(), request.getLastName());
        }

        log.info("Profil mis à jour pour email={}", email);

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

    private String buildRawDisplayName(String firstName, String lastName) {
        String fn = (firstName != null && !firstName.isBlank()) ? firstName.trim() : "";
        String ln = (lastName != null && !lastName.isBlank()) ? lastName.trim() : "";
        if (!fn.isEmpty() && !ln.isEmpty()) return fn + " " + ln;
        if (!fn.isEmpty()) return fn;
        if (!ln.isEmpty()) return ln;
        return null;
    }
}
