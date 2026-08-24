package com.taskforce.tf_api.core.service;

import com.taskforce.tf_api.core.dto.request.UpdateUserRequest;
import com.taskforce.tf_api.core.dto.response.UserResponse;
import com.taskforce.tf_api.core.dto.response.UserSearchResult;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.modules.ged.service.MinioService;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

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
    private final MinioService minioService;
    private final EmailService emailService;

    @Transactional
    public void processDataRequest(String email, String requestType) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        if ("DELETION".equalsIgnoreCase(requestType)) {
            user.setIsActive(false);
            userRepository.save(user);
            log.info("Compte désactivé suite à demande RGPD — email={}", email);
        }
        String firstName = keycloakService.getUserById(user.getKeycloakId()).getFirstName();
        emailService.sendDataRequestEmail(user.getEmail(), firstName, requestType);
    }

    /**
     * Clôt le parcours d'onboarding : enregistre le rôle déclaré et lève le drapeau
     * {@code onboarding_completed} pour que le front cesse d'afficher le wizard.
     * Les compétences, elles, sont posées par leur propre endpoint ({@code MemberSkillController}).
     */
    @Transactional
    public UserResponse completeOnboarding(String email, String jobTitle) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
        if (jobTitle != null && !jobTitle.isBlank()) {
            user.setJobTitle(jobTitle.strip());
        }
        user.setOnboardingCompleted(true);
        user = userRepository.save(user);
        log.info("Onboarding terminé — email={}", email);
        UserRepresentation keycloakUser = keycloakService.getUserById(user.getKeycloakId());
        return buildUserResponse(user, keycloakUser);
    }

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

        // Avatar : on ne stocke PLUS d'URL externe. Si l'utilisateur n'a pas d'avatar (photo OAuth ou
        // fichier importé), `avatarUrl` reste NULL et le front génère un identicon DiceBear LOCALEMENT
        // (data-URI déterministe par email, cf. avatar.ts::getAvatarUrl). L'ancienne auto-génération
        // vers https://api.dicebear.com/... était bloquée par la CSP `img-src` en prod → avatar cassé.
        // Les URLs externes déjà stockées sont purgées par la migration V74.

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

        // Propagation des noms vers Keycloak si fournis (non-bloquant : un échec Keycloak ne rollback pas le save DB)
        String keycloakId = user.getKeycloakId();
        boolean namesChanged = request.getFirstName() != null || request.getLastName() != null;
        if (namesChanged) {
            try {
                keycloakService.updateUserNames(keycloakId, request.getFirstName(), request.getLastName());
            } catch (Exception e) {
                log.warn("Échec de la mise à jour des noms Keycloak pour keycloakId={} — les noms ne sont pas synchronisés : {}", keycloakId, e.getMessage());
            }
        }

        log.info("Profil mis à jour pour email={}", email);

        UserRepresentation keycloakUser = keycloakService.getUserById(keycloakId);
        return buildUserResponse(user, keycloakUser);
    }

    /**
     * Upload l'avatar de l'utilisateur vers Minio et met à jour son avatarUrl.
     * L'URL stockée pointe vers le proxy interne /api/files/avatars/{userId}.
     */
    @Transactional
    public UserResponse uploadAvatar(String email, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Fichier avatar vide");
        }
        if (file.getSize() > 3 * 1024 * 1024) {
            throw new IllegalArgumentException("Avatar trop volumineux — max 3 Mo");
        }

        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        String extension = "jpg";
        String originalFilename = file.getOriginalFilename();
        if (originalFilename != null && originalFilename.contains(".")) {
            extension = originalFilename.substring(originalFilename.lastIndexOf('.') + 1).toLowerCase();
        }
        String objectKey = "avatars/" + user.getId() + "/avatar";

        try {
            minioService.upload(objectKey, file.getInputStream(), file.getSize(), file.getContentType());
        } catch (Exception e) {
            throw new RuntimeException("Échec de l'upload avatar : " + e.getMessage(), e);
        }

        String proxyUrl = "/api/files/avatars/" + user.getId();
        user.setAvatarUrl(proxyUrl);
        userRepository.save(user);

        log.info("Avatar uploadé pour userId={} → {}", user.getId(), proxyUrl);

        UserRepresentation keycloakUser = keycloakService.getUserById(user.getKeycloakId());
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
            .jobTitle(user.getJobTitle())
            .onboardingCompleted(user.getOnboardingCompleted())
            .planType(user.getPlanType())
            .planStatus(user.getPlanStatus())
            .subscriptionStartDate(user.getSubscriptionStartDate())
            .subscriptionEndDate(user.getSubscriptionEndDate())
            .trialEndDate(user.getTrialEndDate())
            .isActive(user.getIsActive())
            .createdAt(user.getCreatedAt())
            .build();
    }

    @Transactional(readOnly = true)
    public List<UserSearchResult> searchUsers(String q) {
        if (q == null || q.isBlank()) return List.of();
        return userRepository.searchByQuery(q.trim(), PageRequest.of(0, 10))
            .stream()
            .map(u -> new UserSearchResult(u.getId(), u.getEmail(), u.getDisplayName(), u.getAvatarUrl()))
            .toList();
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
