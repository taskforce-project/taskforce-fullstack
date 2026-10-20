package com.taskforce.tf_api.core.service;

import java.util.Optional;

/**
 * Jeton GitHub avec lequel appeler l'API de GitHub pour un espace : sur le serveur, la connexion GitHub de l'espace
 * ({@link WorkspaceGitHubTokenSource}) ; dans l'app desktop, le compte GitHub de la personne, connecté par son GitHub
 * CLI ({@code DesktopGitHubTokenSource}). Sert à Copilot et à la relecture des pull requests liées aux tickets.
 */
public interface GitHubTokenSource {

    /** Le jeton, ou vide si GitHub n'est pas connecté. */
    Optional<String> token(Long workspaceId);

    /** Le jeton est celui de la personne (app desktop) : aucune application OAuth n'est nécessaire. */
    boolean personal();

    /** Ce qu'il faut faire quand GitHub n'est pas connecté. */
    String missingHint();

    /** Ce qu'il faut faire quand GitHub refuse le jeton. */
    String refusedHint();

    /** Le compte GitHub dont il s'agit, dans une phrase (« your GitHub account »). */
    String accountLabel();
}
