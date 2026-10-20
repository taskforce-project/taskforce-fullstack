package com.taskforce.tf_api.core.desktop;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.UpdateNotificationPreferencesRequest;
import com.taskforce.tf_api.core.dto.response.DesktopProfileResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.NotificationPreferenceRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.MemberSkillProfileService;
import com.taskforce.tf_api.core.service.NotificationPreferenceService;
import com.taskforce.tf_api.core.service.UserService;
import com.taskforce.tf_api.core.service.WorkspaceService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Au démarrage de l'app desktop, rattache le compte connecté à son utilisateur local, et le crée au premier
 * lancement avec son premier workspace, comme la première connexion par GitHub ou Google sur le serveur. Tourne
 * avant que l'API ne se déclare prête : la première requête de la fenêtre trouve toujours son utilisateur.
 *
 * <p><b>Récupération du compte.</b> Une fois par poste, les réglages du compte en ligne passés par la coque (rôle,
 * onboarding fait, profil de compétences, préférences de notification) comblent ce que l'app n'a pas encore : un
 * compte qui a fait l'onboarding en ligne ne le refait pas. Ce qui a été réglé dans l'app n'est jamais écrasé, et les
 * espaces de travail et leurs données ne sont jamais repris : le profil de compétences va dans le premier workspace
 * local. La photo de profil du compte en ligne, que la coque télécharge, est reprise de la même façon.</p>
 */
@Slf4j
@Component
@Profile("desktop")
@RequiredArgsConstructor
public class DesktopAccountBootstrap implements ApplicationRunner {

    /** Note, dans le dossier du compte, que la reprise des réglages a eu lieu sur ce poste. */
    static final String SETTINGS_TAKEN_MARKER = "account-settings-taken";

    /** Photo du compte en ligne, déposée dans le dossier du compte par la coque (desktop/src/avatar.ts). */
    static final String AVATAR_FILE = "account-avatar";

    /** Note que la photo du compte en ligne a été reprise sur ce poste, ou que l'app en avait déjà une. */
    static final String AVATAR_TAKEN_MARKER = "account-avatar-taken";

    /** Plus grande photo reprise ; la coque n'en dépose pas de plus grande. */
    static final long MAX_AVATAR_BYTES = 5L * 1024 * 1024;

    private final DesktopProperties properties;
    private final UserRepository userRepository;
    private final UserService userService;
    private final WorkspaceService workspaceService;
    private final WorkspaceRepository workspaceRepository;
    private final MemberSkillProfileService skillProfiles;
    private final NotificationPreferenceService notificationPreferences;
    private final NotificationPreferenceRepository notificationPreferenceRepository;
    private final ObjectMapper objectMapper;
    private final PlatformTransactionManager transactionManager;

    @Override
    public void run(ApplicationArguments args) {
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        DesktopProperties.Account account = properties.account();
        User user = transaction.execute(status -> attach(account));
        // Dans sa propre transaction : une reprise qui échoue ne bloque jamais le démarrage, l'onboarding de l'app
        // prend le relais.
        try {
            transaction.executeWithoutResult(status -> takeAccountSettings(user, account.profile()));
        } catch (RuntimeException e) {
            log.warn("Réglages du compte en ligne non repris : {}", e.getMessage());
        }
        takeAccountAvatar(user);
    }

    /**
     * Reprend une fois par poste la photo du compte en ligne, que la coque a téléchargée dans le dossier du compte, si
     * l'utilisateur local n'en a pas : une photo choisie dans l'app l'emporte toujours. Le fichier déposé est effacé
     * dans tous les cas ; un échec laisse l'avatar généré de l'app, sans bloquer le démarrage.
     */
    private void takeAccountAvatar(User user) {
        Path file = Path.of(properties.dataDir(), AVATAR_FILE);
        if (!Files.exists(file)) {
            return;
        }
        Path marker = Path.of(properties.dataDir(), AVATAR_TAKEN_MARKER);
        try {
            if (Files.exists(marker)) {
                return;
            }
            String outcome = "photo de l'app gardée";
            if (isBlank(user.getAvatarUrl())) {
                long size = Files.size(file);
                if (size == 0 || size > MAX_AVATAR_BYTES) {
                    outcome = "photo vide ou trop grande";
                } else {
                    userService.storeAvatar(user, Files.readAllBytes(file), "image/jpeg");
                    outcome = "photo reprise";
                }
            }
            Files.writeString(marker, outcome);
            log.info("Photo du compte en ligne pour l'utilisateur local {} : {}", user.getId(), outcome);
        } catch (IOException | RuntimeException e) {
            log.warn("Photo du compte en ligne non reprise : {}", e.getMessage());
        } finally {
            try {
                Files.deleteIfExists(file);
            } catch (IOException e) {
                log.warn("Photo du compte en ligne non effacée du dossier du compte : {}", e.getMessage());
            }
        }
    }

    /** L'utilisateur local du compte, créé au premier lancement avec son premier workspace. */
    private User attach(DesktopProperties.Account account) {
        Optional<User> existing = userRepository.findByKeycloakId(account.subject())
            .or(() -> userRepository.findByEmail(account.email()));

        if (existing.isPresent()) {
            sync(existing.get(), account);
            return existing.get();
        }

        User user = userRepository.save(User.builder()
            .keycloakId(account.subject())
            .email(account.email())
            .isActive(true)
            .displayName(account.displayName())
            .build());
        workspaceService.createWorkspace(user, account.givenName());
        log.info("Premier lancement de l'app desktop : utilisateur local {} et son premier workspace créés", user.getId());
        return user;
    }

    /**
     * Reprend les réglages du compte en ligne (JSON de {@link DesktopProfileResponse}) là où l'app n'en a pas : rôle
     * vide, onboarding pas fait, aucun profil de compétences, notifications laissées par défaut. Un compte qui n'a pas
     * fait l'onboarding en ligne n'a rien à reprendre : la reprise attend qu'il l'ait fait.
     */
    private void takeAccountSettings(User user, String profileJson) {
        if (profileJson == null || profileJson.isBlank()) {
            return;
        }
        Path marker = Path.of(properties.dataDir(), SETTINGS_TAKEN_MARKER);
        if (Files.exists(marker)) {
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

        List<String> taken = new ArrayList<>();
        boolean userChanged = false;
        if (isBlank(user.getJobTitle()) && !isBlank(profile.jobTitle())) {
            user.setJobTitle(profile.jobTitle());
            userChanged = true;
            taken.add("rôle");
        }
        if (!Boolean.TRUE.equals(user.getOnboardingCompleted())) {
            user.setOnboardingCompleted(true);
            userChanged = true;
            taken.add("onboarding");
        }
        if (userChanged) {
            userRepository.save(user);
        }

        List<Workspace> workspaces = workspaceRepository.findAllByMemberId(user.getId());
        if (profile.skills() != null && !workspaces.isEmpty() && skillProfiles.latestForUser(user.getId()).isEmpty()) {
            skillProfiles.upsert(workspaces.getFirst().getSlug(), user.getId(), profile.skills(), user.getId());
            taken.add("compétences");
        }
        if (profile.notifications() != null && !profile.notifications().isEmpty()
                && notificationPreferenceRepository.findByUserId(user.getId()).isEmpty()) {
            UpdateNotificationPreferencesRequest request = new UpdateNotificationPreferencesRequest();
            request.setPreferences(profile.notifications());
            notificationPreferences.updatePreferences(user.getId(), request);
            taken.add("notifications");
        }

        try {
            Files.createDirectories(marker.getParent());
            Files.writeString(marker, String.join(", ", taken));
        } catch (IOException e) {
            log.warn("Reprise des réglages du compte non notée, elle comblera encore les manques au prochain lancement : {}",
                e.getMessage());
        }
        log.info("Réglages du compte en ligne repris pour l'utilisateur local {} : {}", user.getId(),
            taken.isEmpty() ? "rien à combler" : String.join(", ", taken));
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
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
