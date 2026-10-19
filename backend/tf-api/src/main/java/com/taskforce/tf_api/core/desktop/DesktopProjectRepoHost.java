package com.taskforce.tf_api.core.desktop;

import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.service.ProjectRepoHost;
import com.taskforce.tf_api.shared.exception.BusinessException;

/**
 * Dépôt d'un projet dans l'app desktop. La coque le crée et le vérifie avec le GitHub CLI de la personne
 * ({@code desktop/src/github.ts}), puis le lie ; le runner le clone et y ouvre ses pull requests avec ce même {@code gh}.
 * Le backend local n'a ni intégration GitHub ni jeton : il garde le nom du dépôt, dont la forme est vérifiée en amont
 * ({@code GitHubRepoNames}).
 *
 * <p>Prioritaire sur l'intégration GitHub de l'espace, présente dans ce profil mais jamais connectée.</p>
 */
@Primary
@Component
@Profile("desktop")
public class DesktopProjectRepoHost implements ProjectRepoHost {

    static final String CREATED_ON_THIS_COMPUTER =
        "In the desktop app, the repository is created with GitHub CLI on this computer, then linked";

    @Override
    public String createRepo(String workspaceSlug, String repoName, boolean isPrivate) {
        throw new BusinessException(CREATED_ON_THIS_COMPUTER);
    }

    @Override
    public void assertRepoAccessible(String workspaceSlug, String repoFullName) {
        // L'accès se vérifie avec le `gh` de la personne : par la coque avant de lier, par le runner au clonage.
    }
}
