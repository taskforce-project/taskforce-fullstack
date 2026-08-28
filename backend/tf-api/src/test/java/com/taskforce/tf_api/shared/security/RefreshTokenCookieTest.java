package com.taskforce.tf_api.shared.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseCookie;

/**
 * Verrouille les attributs du cookie de refresh (durcissement OWASP A07) : HttpOnly, portée
 * {@code /api/auth}, hôte-only, Secure pilotable, expiration à la déconnexion.
 */
class RefreshTokenCookieTest {

    @Test
    void set_pose_un_cookie_httponly_de_portee_auth() {
        RefreshTokenCookie c = new RefreshTokenCookie("tf_refresh", true, "Lax", 10800);
        ResponseCookie cookie = c.set("the-refresh-token");

        assertThat(cookie.getName()).isEqualTo("tf_refresh");
        assertThat(cookie.getValue()).isEqualTo("the-refresh-token");
        assertThat(cookie.isHttpOnly()).isTrue();          // jamais lisible par JS
        assertThat(cookie.isSecure()).isTrue();
        assertThat(cookie.getSameSite()).isEqualTo("Lax");
        assertThat(cookie.getPath()).isEqualTo("/api/auth"); // portée minimale
        assertThat(cookie.getDomain()).isNull();             // hôte-only
        assertThat(cookie.getMaxAge().getSeconds()).isEqualTo(10800);
    }

    @Test
    void clear_expire_immediatement_et_reste_httponly() {
        ResponseCookie cookie = new RefreshTokenCookie("tf_refresh", true, "Lax", 10800).clear();

        assertThat(cookie.getMaxAge().getSeconds()).isZero();
        assertThat(cookie.getValue()).isEmpty();
        assertThat(cookie.isHttpOnly()).isTrue();
        assertThat(cookie.getPath()).isEqualTo("/api/auth");
    }

    @Test
    void secure_desactivable_en_dev_localhost_http() {
        ResponseCookie cookie = new RefreshTokenCookie("tf_refresh", false, "Lax", 3600).set("x");
        assertThat(cookie.isSecure()).isFalse();
    }
}
