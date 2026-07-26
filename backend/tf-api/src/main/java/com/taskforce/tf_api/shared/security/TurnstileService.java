package com.taskforce.tf_api.shared.security;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import lombok.extern.slf4j.Slf4j;

/**
 * Vérification Cloudflare Turnstile à l'inscription.
 *
 * <h2>Pourquoi la vérification se fait ICI et non dans un Worker Cloudflare</h2>
 * L'outillage officiel déploie un Worker managé qui relaie l'appel à {@code siteverify}, parce qu'il
 * cible des projets <b>sans backend</b>. TaskForce en a un, et c'est lui qui traite déjà
 * l'inscription. Vérifier le jeton depuis Spring supprime un saut réseau, retire une dépendance
 * supplémentaire du chemin critique de l'inscription, et garde la clé secrète dans notre propre
 * environnement plutôt que dans un secret de Worker. La règle de fond est respectée : <b>l'appel à
 * {@code siteverify} part d'un serveur, jamais du navigateur</b> — c'est tout ce qui compte, la clé
 * secrète ne doit pas transiter côté client.
 *
 * <h2>Deux rideaux, pas un</h2>
 * Turnstile ne remplace pas {@link HumanChallengeService}, il s'y ajoute :
 * <ul>
 *   <li><b>Turnstile</b> juge le visiteur (empreinte navigateur, réputation) ;</li>
 *   <li><b>le défi signé</b> juge la soumission (émise par nous, ni instantanée ni périmée).</li>
 * </ul>
 * Les deux échouent différemment. Surtout, le défi signé <b>ne dépend d'aucun tiers</b> : si
 * Cloudflare est injoignable, il reste une barrière. C'est la raison de garder les deux.
 *
 * <h2>Panne de Cloudflare : on laisse passer, délibérément</h2>
 * Si l'appel à {@code siteverify} échoue pour une raison réseau, l'inscription est <b>autorisée</b>
 * et l'incident journalisé en {@code WARN}. Refuser reviendrait à laisser une panne extérieure
 * fermer les inscriptions — un déni de service offert. Le défi signé, lui, continue de filtrer. En
 * revanche un jeton <b>explicitement invalide</b> est refusé sans appel.
 *
 * <h2>RGPD</h2>
 * Turnstile reçoit l'<b>adresse IP</b> du visiteur : c'est un sous-traitant, à inscrire au registre
 * des traitements. Il ne pose aucun cookie et ne pratique pas de suivi inter-sites, ce qui en fait
 * le choix le moins intrusif de sa catégorie — mais l'affirmation « rien ne quitte l'infrastructure »
 * doit rester énoncée comme « aucun <i>contenu de travail</i> ne quitte l'infrastructure ».
 */
@Service
@Slf4j
public class TurnstileService {

    private static final String SITEVERIFY_URL =
        "https://challenges.cloudflare.com/turnstile/v0/siteverify";

    private final RestTemplate restTemplate;
    private final String secretKey;
    private final boolean enabled;

    public TurnstileService(
        RestTemplate restTemplate,
        @Value("${security.turnstile.secret-key:}") String secretKey
    ) {
        this.restTemplate = restTemplate;
        this.secretKey = secretKey;
        this.enabled = secretKey != null && !secretKey.isBlank();

        if (enabled) {
            log.info("Turnstile actif à l'inscription (vérification côté serveur).");
        } else {
            log.info("Turnstile inactif : « security.turnstile.secret-key » est vide. "
                + "Le défi signé maison reste en place.");
        }
    }

    /** Vrai si une clé secrète est configurée. Le client s'en sert pour afficher ou non le widget. */
    public boolean isEnabled() {
        return enabled;
    }

    /**
     * Vérifie un jeton Turnstile. Renvoie {@code null} si tout va bien, sinon le motif du refus.
     *
     * @param token    valeur de {@code cf-turnstile-response} transmise par le formulaire
     * @param remoteIp adresse de l'appelant, facultative — améliore le jugement de Cloudflare
     */
    public String verify(String token, String remoteIp) {
        if (!enabled) {
            return null;
        }
        if (token == null || token.isBlank()) {
            return "Vérification anti-robot manquante. Rechargez la page et réessayez.";
        }

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("secret", secretKey);
        form.add("response", token);
        if (remoteIp != null && !remoteIp.isBlank()) {
            form.add("remoteip", remoteIp);
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        Map<String, Object> body;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> reponse = restTemplate.postForObject(
                SITEVERIFY_URL, new HttpEntity<>(form, headers), Map.class);
            body = reponse;
        } catch (Exception e) {
            // Panne réseau ou Cloudflare indisponible : on laisse passer plutôt que de fermer les
            // inscriptions sur une défaillance extérieure. Cf. javadoc de la classe.
            log.warn("Turnstile injoignable, inscription autorisée sans cette vérification : {}",
                e.getMessage());
            return null;
        }

        if (body == null) {
            log.warn("Turnstile a répondu un corps vide, inscription autorisée.");
            return null;
        }

        boolean succes = Boolean.TRUE.equals(body.get("success"));
        if (succes) {
            return null;
        }

        Object codes = body.get("error-codes");
        log.warn("Turnstile a refusé le jeton. Codes : {}", codes);
        return "Vérification anti-robot échouée. Rechargez la page et réessayez.";
    }
}
