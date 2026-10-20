package com.taskforce.tf_api.core.desktop;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Réglages du profil {@code desktop}, fournis par la coque Electron à chaque lancement (application-desktop.yml).
 *
 * <p>Le backend de l'app desktop sert une seule personne : celle dont le compte TaskForce (hébergé) est connecté dans
 * la coque. La coque lit son identité dans le jeton du compte et la passe ici ; le backend ne joint jamais Keycloak et
 * marche donc hors ligne (spec Specification_App_Desktop §5.2).</p>
 *
 * @param launchToken jeton tiré par la coque à chaque lancement, exigé sur chaque requête ({@code tfd_...})
 * @param dataDir     dossier de données du compte sur le disque (fichiers, pièces jointes, Brain OS)
 * @param account     compte TaskForce connecté
 */
@ConfigurationProperties(prefix = "desktop")
public record DesktopProperties(String launchToken, String dataDir, Account account) {

    /** Préfixe du jeton de lancement : distingue ce bearer d'un JWT ou d'un jeton personnel ({@code tfp_}). */
    public static final String LAUNCH_TOKEN_PREFIX = "tfd_";

    /**
     * @param subject    identifiant du compte chez Keycloak ({@code sub}), clé de {@code users.keycloak_id}
     * @param email      adresse du compte
     * @param givenName  prénom, s'il est connu
     * @param familyName nom, s'il est connu
     * @param profile    réglages du compte en ligne (JSON de {@code DesktopProfileResponse}), repris une fois par
     *                   poste là où l'app n'a pas encore les siens ; vide si la coque ne les a pas
     */
    public record Account(String subject, String email, String givenName, String familyName, String profile) {

        /** Nom affiché : prénom et nom, sinon la partie locale de l'adresse. */
        public String displayName() {
            String full = (blankToEmpty(givenName) + " " + blankToEmpty(familyName)).trim();
            if (!full.isEmpty()) {
                return full;
            }
            int at = email.indexOf('@');
            return at > 0 ? email.substring(0, at) : email;
        }

        private static String blankToEmpty(String value) {
            return value == null ? "" : value.trim();
        }
    }
}
