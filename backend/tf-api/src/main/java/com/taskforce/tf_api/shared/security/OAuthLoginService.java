package com.taskforce.tf_api.shared.security;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
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
 * Connexion via un fournisseur externe (GitHub, Google), en <b>flux d'autorisation</b>.
 *
 * <h2>Où passe la connexion</h2>
 * <pre>
 * navigateur → Keycloak (courtier) → GitHub → Keycloak → navigateur (/auth/callback?code=…)
 *            → notre API (échange du code) → jetons TaskForce
 * </pre>
 * L'échange du code contre des jetons se fait <b>côté serveur</b> : il exige le secret du client
 * Keycloak, qui ne doit jamais atteindre le navigateur. C'est la seule raison pour laquelle cette
 * étape ne peut pas être portée par le frontend.
 *
 * <h2>Pourquoi ce service coexiste avec le ROPC</h2>
 * L'application authentifie historiquement par mot de passe direct (ROPC). Le flux d'autorisation ne
 * le remplace pas : il s'ajoute pour les identités détenues ailleurs. Les deux aboutissent aux mêmes
 * jetons Keycloak, donc tout l'aval du système est inchangé.
 *
 * <h2>État anti-CSRF</h2>
 * Le paramètre {@code state} est un jeton signé ({@link HmacSigner}), vérifié au retour. Sans lui, un
 * tiers pourrait faire aboutir chez nous un code d'autorisation qu'il a obtenu ailleurs. Il est
 * délibérément <b>sans stockage</b> : la table {@code oauth_states} existante impose un
 * {@code workspace_id} non nul, ce qui n'a aucun sens ici — à cet instant la personne n'a ni
 * workspace, ni parfois même de compte.
 *
 * <p>⚠️ <b>Limite connue</b> : sans magasin, l'état n'est pas à usage unique dans sa fenêtre de
 * validité. Elle est donc courte ({@link #STATE_MAX_AGE}). L'usage unique demanderait une table
 * dédiée ; c'est l'incrément suivant, pas un oubli.</p>
 */
@Service
@Slf4j
public class OAuthLoginService {

    /** Fenêtre volontairement courte : le temps d'un aller-retour chez le fournisseur, pas davantage. */
    private static final Duration STATE_MAX_AGE = Duration.ofMinutes(15);

    private final RestTemplate restTemplate;
    private final HmacSigner stateSigner;

    /**
     * Base du realm que le <b>backend</b> joint (réseau Docker) — sert aux échanges serveur à serveur :
     * échange du code, lecture du profil.
     */
    private final String internalRealmUri;

    /**
     * Base du realm que le <b>navigateur</b> joint — sert à la seule URL destinée au navigateur, celle
     * de l'autorisation. Distincte de l'interne : les confondre produit une URL injoignable côté
     * client (`http://keycloak:8080/...`), le piège classique interne/public de ce projet.
     */
    private final String publicRealmUri;

    private final String clientId;
    private final String clientSecret;

    public OAuthLoginService(
        RestTemplate restTemplate,
        // Lu sur les propriétés `keycloak.*`, et NON sur `spring.security.oauth2.client.*` : ce dernier
        // bloc, jamais consommé ailleurs, déclenchait au démarrage une découverte OIDC qui échoue depuis
        // que le realm a un issuer fixe (« Issuer localhost:8180 did not match requested keycloak:8080 »).
        // Il a été retiré de la configuration ; ces valeurs existent de toute façon sous `keycloak.*`.
        @Value("${keycloak.url}") String internalUrl,
        @Value("${keycloak.public-url}") String publicUrl,
        @Value("${keycloak.realm}") String realm,
        @Value("${keycloak.client-id}") String clientId,
        @Value("${keycloak.client-secret}") String clientSecret,
        // L'état réutilise le secret du défi anti-robot : même nature (jeton court signé), même
        // exigence de confidentialité, et un secret de plus à gérer en production sans bénéfice
        // n'aurait fait qu'augmenter le risque d'en oublier un.
        @Value("${security.human-challenge-secret:}") String stateSecret
    ) {
        this.restTemplate = restTemplate;
        this.internalRealmUri = internalUrl + "/realms/" + realm;
        this.publicRealmUri = publicUrl + "/realms/" + realm;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.stateSigner = new HmacSigner(stateSecret, Clock.systemUTC());
    }

    /**
     * URL vers laquelle envoyer le navigateur pour démarrer la connexion.
     *
     * <p>{@code kc_idp_hint} demande à Keycloak de court-circuiter son propre écran de choix et de
     * partir directement chez le fournisseur : la personne a cliqué « GitHub », lui présenter un
     * second écran de sélection serait une étape de trop.</p>
     */
    public String buildAuthorizationUrl(String provider, String redirectUri) {
        String state = stateSigner.issue();
        return publicRealmUri + "/protocol/openid-connect/auth"
            + "?client_id=" + enc(clientId)
            + "&response_type=code"
            + "&scope=" + enc("openid profile email")
            + "&redirect_uri=" + enc(redirectUri)
            + "&kc_idp_hint=" + enc(provider)
            + "&state=" + enc(state);
    }

    /** Vrai si l'état revient bien de nous et n'a pas dépassé sa fenêtre. */
    public boolean isStateValid(String state) {
        if (!stateSigner.isEnabled()) {
            // Sans secret configuré, l'état ne peut pas être vérifié. On refuse plutôt que de laisser
            // passer : contrairement au défi anti-robot, où le repli permissif est un choix assumé,
            // ici la vérification EST la protection.
            log.error("Connexion externe refusée : aucun secret pour signer l'état anti-CSRF "
                + "(« security.human-challenge-secret » est vide).");
            return false;
        }
        Duration age = stateSigner.ageOf(state);
        return age != null && !age.isNegative() && age.compareTo(STATE_MAX_AGE) <= 0;
    }

    /**
     * Échange le code d'autorisation contre des jetons auprès de Keycloak.
     *
     * @return la réponse jetons de Keycloak, ou {@code null} si l'échange échoue
     */
    public Map<String, Object> exchangeCode(String code, String redirectUri) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("code", code);
        form.add("redirect_uri", redirectUri);
        form.add("client_id", clientId);
        form.add("client_secret", clientSecret);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> reponse = restTemplate.postForObject(
                internalRealmUri + "/protocol/openid-connect/token",
                new HttpEntity<>(form, headers), Map.class);
            return reponse;
        } catch (Exception e) {
            // Le message d'erreur de Keycloak peut contenir le code d'autorisation : on ne journalise
            // que la classe d'exception et un motif court, jamais la réponse brute.
            log.error("Échec de l'échange du code d'autorisation : {}", e.getClass().getSimpleName());
            return null;
        }
    }

    /**
     * Lit le profil associé à un jeton d'accès (adresse, prénom, nom, identifiant Keycloak).
     *
     * <p>Le point {@code userinfo} est interrogé plutôt que le jeton décodé localement : c'est Keycloak
     * qui a fusionné les informations venues du fournisseur, et lui seul sait ce qu'il a retenu.</p>
     */
    public Map<String, Object> fetchUserInfo(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> profil = restTemplate.exchange(
                internalRealmUri + "/protocol/openid-connect/userinfo",
                org.springframework.http.HttpMethod.GET,
                new HttpEntity<>(headers), Map.class).getBody();
            return profil;
        } catch (Exception e) {
            log.error("Lecture du profil impossible : {}", e.getClass().getSimpleName());
            return null;
        }
    }

    private static String enc(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
