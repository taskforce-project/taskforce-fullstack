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

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Vérification « je ne suis pas un robot » à l'inscription — <b>sans service tiers</b>.
 *
 * <h2>Ce que ce mécanisme fait</h2>
 * Le formulaire d'inscription demande un <b>jeton de défi</b> au chargement. Le serveur émet une
 * chaîne signée contenant un aléa et l'instant d'émission. À la soumission, il vérifie que :
 * <ul>
 *   <li>le jeton porte <b>sa</b> signature — il a donc bien été émis par ce serveur, pour ce
 *       formulaire, et n'a pas été fabriqué ;</li>
 *   <li>il n'est pas plus vieux que {@link #MAX_AGE} — un jeton moissonné ne resservira pas demain ;</li>
 *   <li>il n'est pas plus <b>jeune</b> que {@link #MIN_DWELL} — un humain ne remplit pas cinq champs
 *       en moins de trois secondes, un script si.</li>
 * </ul>
 *
 * <h2>Ce qu'il ne fait pas, et pourquoi c'est assumé</h2>
 * Il n'arrête pas un adversaire déterminé : il suffit de demander un jeton, d'attendre trois
 * secondes, puis de poster. C'est un <b>filtre à automates naïfs</b>, pas une preuve d'humanité.
 *
 * <p>Il est dimensionné pour ce qu'il protège réellement. La création de compte est déjà verrouillée
 * en aval par la <b>vérification de l'adresse par code à usage unique</b> : sans accès à la boîte
 * mail, aucun compte n'aboutit. Le risque restant n'est donc pas le faux compte, c'est le
 * <b>volume</b> — des milliers de soumissions qui feraient partir autant de courriels depuis notre
 * serveur, au détriment de sa réputation d'expéditeur. Contre cela, refuser les soumissions
 * instantanées et non signées est efficace et proportionné.</p>
 *
 * <p>Le choix d'écarter un service tiers (Turnstile, reCAPTCHA) est délibéré : il ferait sortir des
 * adresses IP de visiteurs vers un sous-traitant, à inscrire au registre des traitements, pour un
 * gain qui ne se justifie qu'à une échelle que ce produit n'a pas.</p>
 *
 * <h2>Sans état, à dessein</h2>
 * Aucun stockage : la signature porte toute l'information. L'infrastructure de développement n'a pas
 * de Redis, et créer une table pour des jetons vivant une heure coûterait plus que le gain.
 * <b>Conséquence à connaître</b> : un même jeton peut servir plusieurs fois dans sa fenêtre de
 * validité. L'usage unique demanderait un magasin partagé — c'est l'incrément suivant, pas un oubli.
 */
@Service
@Slf4j
public class HumanChallengeService {

    /**
     * Au-delà, le jeton est périmé : il a pu être moissonné puis rejoué.
     *
     * <p>Une heure, et non quelques minutes, parce que le jeton est émis au <b>chargement de l'étape
     * 1</b> et consommé au <b>déclenchement de l'étape 3</b> : entre les deux, la personne saisit ses
     * informations puis choisit une formule. Une fenêtre courte aurait fait échouer des inscriptions
     * parfaitement légitimes — celles des gens qui prennent le temps de comparer les offres.</p>
     */
    private static final Duration MAX_AGE = Duration.ofHours(1);

    /** En deçà, la soumission est trop rapide pour une saisie humaine de cinq champs. */
    private static final Duration MIN_DWELL = Duration.ofSeconds(3);

    private static final String HMAC_ALGO = "HmacSHA256";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

    private final byte[] key;
    private final boolean enabled;
    private final Clock clock;

    /**
     * Horloge injectable. Le mécanisme repose entièrement sur des durées — trois secondes de délai
     * minimal, une heure de validité — et les vérifier en dormant rendrait la suite lente et
     * instable. Les tests fournissent deux horloges fixes, une pour l'émission, une pour la
     * vérification : le jeton étant sans état, cela suffit à parcourir toutes les fenêtres.
     */
    HumanChallengeService(String secret, Clock clock) {
        this.enabled = secret != null && !secret.isBlank();
        this.key = enabled ? secret.getBytes(StandardCharsets.UTF_8) : new byte[0];
        this.clock = clock;
    }

    /**
     * Constructeur utilisé par Spring. L'annotation est nécessaire : depuis l'ajout du constructeur
     * à horloge injectable, la classe en compte deux, et Spring cherchait alors un constructeur sans
     * argument plutôt que d'en choisir un — le contexte refusait de démarrer.
     */
    @Autowired
    public HumanChallengeService(@Value("${security.human-challenge-secret:}") String secret) {
        this(secret, Clock.systemUTC());

        // À défaut de secret dédié, le mécanisme est inactif plutôt que faussement sûr : une clé
        // vide signerait tout et n'importe quoi. L'état est journalisé pour ne pas rester invisible,
        // même leçon que le chiffrement au repos.
        if (enabled) {
            log.info("Vérification humaine active à l'inscription (défi signé, sans service tiers).");
        } else {
            log.warn("Vérification humaine INACTIVE : « security.human-challenge-secret » est vide. "
                + "Les inscriptions ne seront pas filtrées.");
        }
    }

    /** Vrai si un secret est configuré ; sinon la vérification laisse tout passer. */
    public boolean isEnabled() {
        return enabled;
    }

    /**
     * Émet un jeton de défi. Format : {@code base64url(nonce).epochMillis.base64url(hmac)}.
     */
    public String issue() {
        if (!enabled) {
            return "";
        }
        byte[] nonce = new byte[12];
        RANDOM.nextBytes(nonce);
        String payload = ENCODER.encodeToString(nonce) + "." + clock.instant().toEpochMilli();
        return payload + "." + ENCODER.encodeToString(sign(payload));
    }

    /**
     * Vérifie un jeton. Renvoie {@code null} si tout va bien, sinon le motif du refus — destiné au
     * message d'erreur remonté à l'appelant.
     */
    public String verify(String token) {
        if (!enabled) {
            return null;
        }
        if (token == null || token.isBlank()) {
            return "Vérification humaine manquante. Rechargez la page et réessayez.";
        }

        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return "Vérification humaine invalide. Rechargez la page et réessayez.";
        }

        String payload = parts[0] + "." + parts[1];
        byte[] attendu = sign(payload);
        byte[] recu;
        try {
            recu = DECODER.decode(parts[2]);
        } catch (IllegalArgumentException e) {
            return "Vérification humaine invalide. Rechargez la page et réessayez.";
        }

        // Comparaison à temps constant : une comparaison naïve laisserait fuiter la signature
        // attendue, octet par octet, à qui mesure le temps de réponse.
        if (!MessageDigest.isEqual(attendu, recu)) {
            return "Vérification humaine invalide. Rechargez la page et réessayez.";
        }

        long emisA;
        try {
            emisA = Long.parseLong(parts[1]);
        } catch (NumberFormatException e) {
            return "Vérification humaine invalide. Rechargez la page et réessayez.";
        }

        Duration age = Duration.between(Instant.ofEpochMilli(emisA), clock.instant());
        if (age.isNegative() || age.compareTo(MAX_AGE) > 0) {
            return "Vérification humaine expirée. Rechargez la page et réessayez.";
        }
        if (age.compareTo(MIN_DWELL) < 0) {
            log.warn("Inscription refusée : soumission en {} ms, en deçà du délai humain minimal.", age.toMillis());
            return "Formulaire soumis trop rapidement. Réessayez.";
        }

        return null;
    }

    private byte[] sign(String payload) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGO);
            mac.init(new SecretKeySpec(key, HMAC_ALGO));
            return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("Signature du défi impossible", e);
        }
    }
}
