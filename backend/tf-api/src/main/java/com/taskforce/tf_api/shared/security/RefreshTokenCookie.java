package com.taskforce.tf_api.shared.security;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * Fabrique le cookie porteur du <b>refresh token</b>.
 *
 * <p>Objectif sécurité (OWASP A07) : le refresh token — jeton de plus longue vie, cible de choix —
 * ne doit JAMAIS être lisible par du JavaScript. Il vit donc dans un cookie {@code HttpOnly},
 * envoyé automatiquement par le navigateur aux seuls endpoints {@code /api/auth/*} (refresh + logout).
 * L'access token, lui, reste porté par l'en-tête {@code Authorization: Bearer} (courte durée, 30 min).
 *
 * <p>Flags pilotés par la config :
 * <ul>
 *   <li>{@code Secure} — activé en prod (HTTPS), désactivé en dev (localhost http) ;</li>
 *   <li>{@code SameSite=Lax} — app.* et api.* partagent le même site (eTLD+1), le cookie passe
 *       sur l'XHR de refresh ; Lax bloque les requêtes cross-<i>site</i> ;</li>
 *   <li>{@code Path=/api/auth} — portée minimale (le cookie n'est envoyé qu'au refresh/logout) ;</li>
 *   <li>pas de {@code Domain} → cookie <b>hôte-only</b> : posé par api.*, il n'est visible que par api.*.</li>
 * </ul>
 */
@Component
public class RefreshTokenCookie {

    private final String name;
    private final boolean secure;
    private final String sameSite;
    private final long maxAgeSeconds;

    public RefreshTokenCookie(
            @Value("${auth.refresh-cookie.name:tf_refresh}") String name,
            @Value("${auth.refresh-cookie.secure:false}") boolean secure,
            @Value("${auth.refresh-cookie.same-site:Lax}") String sameSite,
            @Value("${auth.refresh-cookie.max-age-seconds:10800}") long maxAgeSeconds) {
        this.name = name;
        this.secure = secure;
        this.sameSite = sameSite;
        this.maxAgeSeconds = maxAgeSeconds;
    }

    public String name() {
        return name;
    }

    /** Cookie posant le refresh token (durée alignée sur la session SSO max de Keycloak). */
    public ResponseCookie set(String refreshToken) {
        return base(refreshToken).maxAge(Duration.ofSeconds(maxAgeSeconds)).build();
    }

    /** Cookie de suppression (même nom/chemin, expiration immédiate) — posé à la déconnexion. */
    public ResponseCookie clear() {
        return base("").maxAge(0).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(name, value)
            .httpOnly(true)
            .secure(secure)
            .sameSite(sameSite)
            .path("/api/auth");
    }
}
