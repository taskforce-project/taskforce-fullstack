package com.taskforce.tf_api.core.desktop;

import java.util.Optional;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.WorkspaceService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Au démarrage de l'app desktop, rattache le compte connecté à son utilisateur local, et le crée au premier
 * lancement avec son premier workspace, comme la première connexion par GitHub ou Google sur le serveur. Tourne
 * avant que l'API ne se déclare prête : la première requête de la fenêtre trouve toujours son utilisateur.
 */
@Slf4j
@Component
@Profile("desktop")
@RequiredArgsConstructor
public class DesktopAccountBootstrap implements ApplicationRunner {

    private final DesktopProperties properties;
    private final UserRepository userRepository;
    private final WorkspaceService workspaceService;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        DesktopProperties.Account account = properties.account();
        Optional<User> existing = userRepository.findByKeycloakId(account.subject())
            .or(() -> userRepository.findByEmail(account.email()));

        if (existing.isPresent()) {
            sync(existing.get(), account);
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
