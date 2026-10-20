package com.taskforce.tf_api.shared.util;

/**
 * Valeur venue de l'extérieur (requête, service tiers, message d'exception), prête à journaliser : ses sauts de ligne
 * sont remplacés, si bien qu'elle ne peut pas fabriquer une fausse ligne de journal (CWE-117), et sa longueur est
 * bornée. Le remplacement par {@code \R} est la forme que CodeQL reconnaît ({@code java/log-injection}).
 */
public final class LogSafe {

    private static final int MAX_LENGTH = 200;

    private LogSafe() {
    }

    public static String of(Object value) {
        if (value == null) {
            return "null";
        }
        String text = value.toString().replaceAll("\\R", "_").replace('\t', ' ');
        return text.length() > MAX_LENGTH ? text.substring(0, MAX_LENGTH) + "..." : text;
    }
}
