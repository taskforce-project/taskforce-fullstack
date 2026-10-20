package com.taskforce.tf_api.core.service;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.repository.IntegrationRepository;

import lombok.RequiredArgsConstructor;

/** Sur le serveur : le jeton de la connexion GitHub de l'espace (Réglages > Integrations), gardé chiffré en base. */
@Component
@RequiredArgsConstructor
public class WorkspaceGitHubTokenSource implements GitHubTokenSource {

    private final IntegrationRepository integrationRepository;

    @Override
    public Optional<String> token(Long workspaceId) {
        if (workspaceId == null) {
            return Optional.empty();
        }
        return integrationRepository.findByWorkspaceIdAndProvider(workspaceId, IntegrationProvider.GITHUB)
            .map(Integration::getAccessToken)
            .filter(token -> !token.isBlank());
    }

    @Override
    public boolean personal() {
        return false;
    }

    @Override
    public String missingHint() {
        return "Connect GitHub to this workspace first (Settings > Integrations).";
    }

    @Override
    public String refusedHint() {
        return "reconnect GitHub in Settings > Integrations";
    }

    @Override
    public String accountLabel() {
        return "the GitHub account connected to the workspace";
    }
}
