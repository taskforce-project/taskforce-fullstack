package com.taskforce.tf_api.core.api;

import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.response.AuthResponse;
import com.taskforce.tf_api.core.service.AuthService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import com.taskforce.tf_api.shared.security.OAuthLoginService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Connexion via un fournisseur externe — flux d'autorisation.
 *
 * <p>Deux points d'entrée, tous deux publics (ils précèdent l'authentification, par définition) :
 * <ol>
 *   <li>{@code GET /api/auth/oauth/{provider}/authorize} — renvoie l'URL vers laquelle envoyer le
 *       navigateur. Le client ne construit pas cette URL lui-même : elle contient l'état anti-CSRF,
 *       que seul le serveur peut signer.</li>
 *   <li>{@code POST /api/auth/oauth/callback} — reçoit le code d'autorisation récupéré par la page de
 *       rappel, l'échange contre des jetons, et renvoie une session TaskForce.</li>
 * </ol>
 *
 * <p><b>Pourquoi l'échange est un POST venant du navigateur, et non une redirection serveur.</b>
 * Keycloak redirige le <i>navigateur</i> vers une URL enregistrée sur le client
 * ({@code http://localhost:3000/*} l'est déjà). La page de rappel du frontend relaie alors le code à
 * cette API, qui seule détient le secret du client Keycloak. Faire porter la redirection finale par
 * l'API aurait imposé d'enregistrer une URL supplémentaire et de rendre les jetons dans une
 * redirection — donc dans une barre d'adresse et un historique.</p>
 */
@RestController
@RequestMapping("/api/auth/oauth")
@RequiredArgsConstructor
@Slf4j
public class OAuthLoginController {

    /**
     * Liste blanche des fournisseurs. Sans elle, le segment d'URL serait recopié tel quel dans
     * {@code kc_idp_hint} : une valeur arbitraire fournie par l'appelant se retrouverait dans une URL
     * que nous demandons au navigateur de suivre.
     */
    private static final Set<String> FOURNISSEURS = Set.of("github", "google");

    private final OAuthLoginService oauthLoginService;
    private final AuthService authService;

    /** URL de démarrage de la connexion externe. */
    @GetMapping("/{provider}/authorize")
    public ResponseEntity<ApiResponse<Map<String, String>>> authorize(
        @PathVariable String provider,
        @RequestParam("redirectUri") String redirectUri
    ) {
        String p = provider == null ? "" : provider.toLowerCase();
        if (!FOURNISSEURS.contains(p)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error("Fournisseur non pris en charge : " + provider));
        }

        String authUrl = oauthLoginService.buildAuthorizationUrl(p, redirectUri);
        return ResponseEntity.ok(ApiResponse.success("URL d'autorisation générée",
            Map.of("authUrl", authUrl)));
    }

    /** Échange du code d'autorisation contre une session TaskForce. */
    @PostMapping("/callback")
    public ResponseEntity<ApiResponse<AuthResponse>> callback(@RequestBody CallbackRequest request) {
        if (!oauthLoginService.isStateValid(request.state())) {
            // Message volontairement identique quelle que soit la cause (état absent, falsifié,
            // expiré) : détailler renseignerait un attaquant sur l'état de sa tentative.
            log.warn("Rappel de connexion externe refusé : état anti-CSRF invalide.");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error("Connexion expirée ou invalide. Merci de recommencer."));
        }

        Map<String, Object> jetons = oauthLoginService.exchangeCode(request.code(), request.redirectUri());
        if (jetons == null || jetons.get("access_token") == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error("Échec de la connexion externe. Merci de recommencer."));
        }

        Map<String, Object> profil = oauthLoginService.fetchUserInfo(String.valueOf(jetons.get("access_token")));
        if (profil == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error("Profil illisible auprès du fournisseur d'identité."));
        }

        try {
            AuthResponse reponse = authService.completeOAuthLogin(profil, jetons);
            return ResponseEntity.ok(ApiResponse.success("Connexion réussie", reponse));
        } catch (Exception e) {
            log.error("Finalisation de la connexion externe impossible : {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(e.getMessage()));
        }
    }

    /** Charge utile du rappel. `redirectUri` doit être identique à celle envoyée à l'autorisation. */
    public record CallbackRequest(String code, String state, String redirectUri) { }
}
