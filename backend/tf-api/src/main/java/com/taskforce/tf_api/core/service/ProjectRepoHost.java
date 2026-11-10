package com.taskforce.tf_api.core.service;

import java.util.List;

/**
 * Là où se crée et se vérifie le dépôt GitHub d'un projet. Dans la webapp, c'est l'intégration GitHub de l'espace
 * ({@link GitHubIntegrationService}, jeton OAuth côté serveur). Dans l'app desktop, c'est le GitHub CLI de la personne,
 * côté coque ({@code DesktopProjectRepoHost}).
 */
public interface ProjectRepoHost {

    /** Crée le dépôt et rend son {@code owner/name}. */
    String createRepo(String workspaceSlug, String repoName, boolean isPrivate);

    /** Lève une {@code BusinessException} si le dépôt {@code owner/name} n'existe pas ou n'est pas accessible. */
    void assertRepoAccessible(String workspaceSlug, String repoFullName);

    /**
     * Vrai quand TaskForce crée ici un dépôt d'un geste, sans rien de plus de la personne : la conversation ne propose
     * « un nouveau dépôt » que dans ce cas (R115).
     */
    default boolean createsRepos(String workspaceSlug) {
        return true;
    }

    /** Vrai quand TaskForce lie ici un dépôt existant : la conversation propose alors d'en lier un. */
    default boolean linksRepos(String workspaceSlug) {
        return true;
    }

    /** Quelques dépôts que la personne peut lier, les derniers changés d'abord, quand l'hôte les connaît ; vide sinon. */
    default List<String> recentRepos(String workspaceSlug, int limit) {
        return List.of();
    }
}
