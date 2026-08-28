package com.taskforce.tf_api.shared.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Garde anti-SSRF : les URL internes / à schéma exotique sont refusées, les http(s)
 * publics passent. Cas construits sur des littéraux IP + localhost + rejets de schéma,
 * donc <b>aucune résolution DNS réseau</b> n'est nécessaire (déterministe en CI).
 */
class SsrfGuardTest {

    @ParameterizedTest
    @ValueSource(strings = {
        "http://127.0.0.1/hook",                     // bouclage
        "http://localhost/hook",                     // bouclage (hosts)
        "http://169.254.169.254/latest/meta-data/",  // métadonnées cloud (link-local)
        "http://10.0.0.5/x",                         // privé 10/8
        "http://172.16.0.9/x",                       // privé 172.16/12
        "http://192.168.1.10/x",                     // privé 192.168/16
        "http://100.64.0.1/x",                       // CGNAT / Tailscale
        "http://0.0.0.0/x",                          // any-local
        "http://[::1]/x",                            // bouclage IPv6
        "ftp://example.com/x",                       // schéma interdit
        "file:///etc/passwd",                        // schéma interdit
        "gopher://8.8.8.8/x",                        // schéma interdit
    })
    void bloque_les_urls_internes_ou_schemas_interdits(String url) {
        assertThatThrownBy(() -> SsrfGuard.assertPublicHttpUrl(url))
            .isInstanceOf(IllegalArgumentException.class);
        assertThat(SsrfGuard.isPublicHttpUrl(url)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "http://8.8.8.8/hook",
        "https://1.1.1.1/webhooks/tf",
    })
    void autorise_les_http_s_publics(String url) {
        SsrfGuard.assertPublicHttpUrl(url); // ne lève pas
        assertThat(SsrfGuard.isPublicHttpUrl(url)).isTrue();
    }

    @Test
    void bloque_null_et_vide() {
        assertThat(SsrfGuard.isPublicHttpUrl(null)).isFalse();
        assertThat(SsrfGuard.isPublicHttpUrl("   ")).isFalse();
    }
}
