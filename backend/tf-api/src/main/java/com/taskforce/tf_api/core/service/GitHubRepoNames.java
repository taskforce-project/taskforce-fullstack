package com.taskforce.tf_api.core.service;

import java.util.regex.Pattern;

import com.taskforce.tf_api.shared.exception.BusinessException;

/**
 * Noms de dépôt GitHub reçus du client (OSS-6.3). Un tel nom finit dans l'URL de l'API GitHub, appelée avec le
 * jeton du workspace : il doit être de la forme {@code propriétaire/nom}, sans caractère qui changerait le chemin
 * ou la requête envoyés ({@code ?}, {@code #}, {@code ..}, accolades).
 */
public final class GitHubRepoNames {

    /** Propriétaire : 39 caractères au plus, lettres, chiffres et tirets ; nom : 100 caractères au plus. */
    private static final Pattern FULL_NAME = Pattern.compile("[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}");
    private static final Pattern NAME = Pattern.compile("[A-Za-z0-9_.-]{1,100}");

    private GitHubRepoNames() {}

    /** {@code propriétaire/nom} valide ? */
    public static boolean isFullName(String value) {
        return value != null && FULL_NAME.matcher(value).matches() && !value.contains("..");
    }

    /** Le nom complet sans espaces autour, ou {@link BusinessException} (400) s'il n'est pas valide. */
    public static String requireFullName(String value) {
        String trimmed = value == null ? "" : value.trim();
        if (!isFullName(trimmed)) {
            throw new BusinessException("Invalid GitHub repository: expected owner/name");
        }
        return trimmed;
    }

    /** Nom d'un dépôt à créer, sans propriétaire, ou {@link BusinessException} (400). */
    public static String requireName(String value) {
        String trimmed = value == null ? "" : value.trim();
        if (!NAME.matcher(trimmed).matches() || trimmed.contains("..") || trimmed.equals(".")) {
            throw new BusinessException("Invalid repository name: letters, digits, dots, dashes and underscores only");
        }
        return trimmed;
    }
}
