package com.taskforce.tf_api.core.service;

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
}
