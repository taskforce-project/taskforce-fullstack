package com.taskforce.tf_api.shared.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Jeton court signé et horodaté, sans stockage.
 *
 * <p>Format : {@code base64url(nonce).epochMillis.base64url(hmac)}. La signature couvre le nonce et
 * l'horodatage : on peut donc vérifier qu'un jeton vient bien de ce serveur et connaître son âge,
 * sans rien conserver côté serveur.</p>
 *
 * <p><b>Pourquoi cette classe existe.</b> Deux besoins du projet réclamaient exactement ce mécanisme :
 * le défi anti-robot de l'inscription ({@link HumanChallengeService}) et l'état anti-CSRF de la
 * connexion via un fournisseur externe ({@code OAuthLoginService}). L'écrire deux fois aurait signifié
 * deux implémentations cryptographiques à relire, à corriger et à garder d'accord — c'est précisément
 * le genre de duplication qui finit par diverger sur le détail qui compte, ici la comparaison à temps
 * constant.</p>
 *
 * <p>Les <b>politiques</b> (durée de validité, délai minimal, messages d'erreur) restent chez les
 * appelants : elles diffèrent d'un usage à l'autre, et seule la mécanique est commune.</p>
 *
 * <p>Un état signé plutôt qu'une ligne en base : la table {@code oauth_states} existante impose un
 * {@code workspace_id} non nul, ce qui convient à une intégration mais pas à une connexion — à cet
 * instant la personne n'a ni workspace, ni parfois même de compte. Réutiliser la table aurait exigé de
 * relâcher cette contrainte pour tout le monde.</p>
 */
public final class HmacSigner {

    private static final String ALGO = "HmacSHA256";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

    private final byte[] key;
    private final Clock clock;

    /** Clé vide ou nulle → {@link #isEnabled()} renvoie faux et rien n'est signé. */
    public HmacSigner(String secret, Clock clock) {
        this.key = (secret == null || secret.isBlank())
            ? new byte[0]
            : secret.getBytes(StandardCharsets.UTF_8);
        this.clock = clock;
    }

    public boolean isEnabled() {
        return key.length > 0;
    }

    /** Émet un jeton signé horodaté à l'instant courant. Chaîne vide si aucune clé n'est configurée. */
    public String issue() {
        if (!isEnabled()) {
            return "";
        }
        byte[] nonce = new byte[12];
        RANDOM.nextBytes(nonce);
        String payload = ENCODER.encodeToString(nonce) + "." + clock.instant().toEpochMilli();
        return payload + "." + ENCODER.encodeToString(sign(payload));
    }

    /**
     * Vérifie la signature et renvoie l'<b>âge</b> du jeton, ou {@code null} si la signature est
     * invalide, absente ou malformée.
     *
     * <p>L'âge est rendu à l'appelant plutôt que jugé ici : un défi anti-robot veut un délai
     * <i>minimal</i>, un état anti-CSRF une fenêtre <i>courte</i>. La mécanique est commune, la
     * politique non.</p>
     */
    public Duration ageOf(String token) {
        if (!isEnabled() || token == null || token.isBlank()) {
            return null;
        }
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return null;
        }

        String payload = parts[0] + "." + parts[1];
        byte[] recu;
        try {
            recu = DECODER.decode(parts[2]);
        } catch (IllegalArgumentException e) {
            return null;
        }

        // Comparaison à temps constant : une comparaison naïve laisserait fuiter la signature
        // attendue, octet par octet, à qui mesure le temps de réponse.
        if (!MessageDigest.isEqual(sign(payload), recu)) {
            return null;
        }

        try {
            return Duration.between(Instant.ofEpochMilli(Long.parseLong(parts[1])), clock.instant());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private byte[] sign(String payload) {
        try {
            Mac mac = Mac.getInstance(ALGO);
            mac.init(new SecretKeySpec(key, ALGO));
            return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("Signature impossible", e);
        }
    }
}
