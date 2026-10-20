package com.taskforce.tf_api.core.desktop;

import java.util.List;
import java.util.Optional;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.UpdateNotificationPreferencesRequest;
import com.taskforce.tf_api.core.dto.response.DesktopProfileResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.MemberSkillProfileService;
import com.taskforce.tf_api.core.service.NotificationPreferenceService;
import com.taskforce.tf_api.core.service.WorkspaceService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Au démarrage de l'app desktop, rattache le compte connecté à son utilisateur local, et le crée au premier
 * lancement avec son premier workspace, comme la première connexion par GitHub ou Google sur le serveur. Tourne
 * avant que l'API ne se déclare prête : la première requête de la fenêtre trouve toujours son utilisateur.
 *
 * <p><b>Récupération du compte.</b> Tant que l'onboarding n'est pas fait sur ce poste, les réglages du compte en ligne
 * passés par la coque (rôle, profil de compétences, préférences de notification) s'appliquent ici, et l'onboarding
 * fait en ligne n'est pas redemandé. Les espaces de travail et leurs données ne sont jamais repris : le profil de
 * compétences va dans le premier workspace local.</p>
 */
@Slf4j
@Component
@Profile("desktop")
@RequiredArgsConstructor
public class DesktopAccountBootstrap implements ApplicationRunner {

    private final DesktopProperties properties;
    private final UserRepository userRepository;
    private final WorkspaceService workspaceService;
    private final WorkspaceRepository workspaceRepository;
    private final MemberSkillProfileService skillProfiles;
    private final NotificationPreferenceService notificationPreferences;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        DesktopProperties.Account account = properties.account();
        Optional<User> existing = userRepository.findByKeycloakId(account.subject())
            .or(() -> userRepository.findByEmail(account.email()));

        if (existing.isPresent()) {
            sync(existing.get(), account);
            importAccountSettings(existing.get(), account.profile());
            return;
        }

        User user = userRepository.save(User.builder()
            .keycloakId(account.subject())
            .email(account.email())
            .isActive(true)
            .displayName(account.displayName())
            .build());
        workspaceService.createWorkspace(user, account.givenName());
        log.info("Premier lancement de l'app desktop : utilisateur local {} et son premier workspace créés", user.getId());
        importAccountSettings(user, account.profile());
    }

    private void importAccountSettings(User user, String profileJson) {
        if (Boolean.TRUE.equals(user.getOnboardingCompleted()) || profileJson == null || profileJson.isBlank()) {
            return;
        }
        DesktopProfileResponse profile;
        try {
            profile = objectMapper.readValue(profileJson, DesktopProfileResponse.class);
        } catch (Exception e) {
            log.warn("Réglages du compte illisibles, l'onboarding de l'app les demandera : {}", e.getMessage());
            return;
        }
        if (profile == null || !profile.onboardingCompleted()) {
            return;
        }
        user.setJobTitle(profile.jobTitle());
        user.setOnboardingCompleted(true);
        userRepository.save(user);

        List<Workspace> workspaces = workspaceRepository.findAllByMemberId(user.getId());
        if (profile.skills() != null && !workspaces.isEmpty()) {
            skillProfiles.upsert(workspaces.getFirst().getSlug(), user.getId(), profile.skills(), user.getId());
        }
        if (profile.notifications() != null && !profile.notifications().isEmpty()) {
            UpdateNotificationPreferencesRequest request = new UpdateNotificationPreferencesRequest();
            request.setPreferences(profile.notifications());
            notificationPreferences.updatePreferences(user.getId(), request);
        }
        log.info("Réglages du compte en ligne repris pour l'utilisateur local {} (onboarding déjà fait en ligne)", user.getId());
    }

    /**
     * Le compte hébergé fait foi pour l'adresse et l'identifiant ; le nom affiché, lui, se règle dans l'app et n'est
     * pas écrasé à chaque lancement.
     */
    private void sync(User user, DesktopProperties.Account account) {
        boolean changed = false;
        if (!account.subject().equals(user.getKeycloakId())) {
            user.setKeycloakId(account.subject());
            changed = true;
        }
        if (!account.email().equalsIgnoreCase(user.getEmail())) {
            user.setEmail(account.email());
            changed = true;
        }
        if (user.getDisplayName() == null || user.getDisplayName().isBlank()) {
            user.setDisplayName(account.displayName());
            changed = true;
        }
        if (changed) {
            userRepository.save(user);
        }
    }
}
