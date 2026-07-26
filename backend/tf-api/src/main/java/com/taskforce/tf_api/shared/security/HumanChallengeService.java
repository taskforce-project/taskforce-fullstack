package com.taskforce.tf_api.shared.security;

import java.time.Clock;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Vérification « je ne suis pas un robot » à l'inscription — <b>sans service tiers</b>.
 *
 * <h2>Ce que ce mécanisme fait</h2>
 * Le formulaire d'inscription demande un <b>jeton de défi</b> au chargement. Le serveur émet une
 * chaîne signée contenant un aléa et l'instant d'émission (cf. {@link HmacSigner}). À la soumission,
 * il vérifie que :
 * <ul>
 *   <li>le jeton porte <b>sa</b> signature — il a donc bien été émis par ce serveur et n'a pas été
 *       fabriqué ;</li>
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
 * <p>Depuis le 24/07/2026 il ne travaille plus seul : {@link TurnstileService} juge le <b>visiteur</b>
 * quand il est configuré, là où ce défi juge la <b>soumission</b>. Les deux échouent différemment, et
 * celui-ci ne dépend d'aucun tiers — il reste donc une barrière si Cloudflare est injoignable.</p>
 *
 * <h2>Sans état, à dessein</h2>
 * Aucun stockage : la signature porte toute l'information. <b>Conséquence à connaître</b> : un même
 * jeton peut servir plusieurs fois dans sa fenêtre de validité. L'usage unique demanderait un magasin
 * partagé — c'est l'incrément suivant, pas un oubli.
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

    private static final String MSG_INVALIDE =
        "Vérification humaine invalide. Rechargez la page et réessayez.";

    private final HmacSigner signer;

    /**
     * Constructeur à horloge injectable, réservé aux tests. Le mécanisme repose entièrement sur des
     * durées — trois secondes de délai minimal, une heure de validité — et les vérifier en dormant
     * rendrait la suite lente et instable.
     */
    HumanChallengeService(String secret, Clock clock) {
        this.signer = new HmacSigner(secret, clock);
    }

    /**
     * Constructeur utilisé par Spring. L'annotation est nécessaire : la classe en compte deux, et
     * Spring chercherait sinon un constructeur sans argument plutôt que d'en choisir un — le contexte
     * refusait de démarrer.
     */
    @Autowired
    public HumanChallengeService(@Value("${security.human-challenge-secret:}") String secret) {
        this(secret, Clock.systemUTC());

        // À défaut de secret dédié, le mécanisme est inactif plutôt que faussement sûr : une clé
        // vide signerait tout et n'importe quoi. L'état est journalisé pour ne pas rester invisible,
        // même leçon que le chiffrement au repos.
        if (signer.isEnabled()) {
            log.info("Vérification humaine active à l'inscription (défi signé, sans service tiers).");
        } else {
            log.warn("Vérification humaine INACTIVE : « security.human-challenge-secret » est vide. "
                + "Les inscriptions ne seront pas filtrées.");
        }
    }

    /** Vrai si un secret est configuré ; sinon la vérification laisse tout passer. */
    public boolean isEnabled() {
        return signer.isEnabled();
    }

    /** Émet un jeton de défi. */
    public String issue() {
        return signer.issue();
    }

    /**
     * Vérifie un jeton. Renvoie {@code null} si tout va bien, sinon le motif du refus — destiné au
     * message d'erreur remonté à l'appelant.
     */
    public String verify(String token) {
        if (!signer.isEnabled()) {
            return null;
        }
        if (token == null || token.isBlank()) {
            return "Vérification humaine manquante. Rechargez la page et réessayez.";
        }

        Duration age = signer.ageOf(token);
        if (age == null) {
            return MSG_INVALIDE;
        }
        if (age.isNegative() || age.compareTo(MAX_AGE) > 0) {
            return "Vérification humaine expirée. Rechargez la page et réessayez.";
        }
        if (age.compareTo(MIN_DWELL) < 0) {
            log.warn("Inscription refusée : soumission en {} ms, en deçà du délai humain minimal.", age.toMillis());
            return "Formulaire soumis trop rapidement. Réessayez.";
        }

        return null;
    }
}
