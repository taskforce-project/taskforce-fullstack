package com.taskforce.tf_api.core.service.webhook;

import java.util.Base64;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Tests unitaires de {@link WebhookSignature}. */
@DisplayName("WebhookSignature")
class WebhookSignatureTest {

    @Test
    @DisplayName("signe timestamp.corps en HMAC-SHA256 hexadécimal (vecteur calculé hors Java)")
    void signs_timestamp_dot_body() {
        // Valeur attendue calculée avec Node : createHmac('sha256', 'whsec_test').update('1700000000.{"type":"ping"}').
        assertThat(WebhookSignature.sign("whsec_test", 1_700_000_000L, "{\"type\":\"ping\"}"))
            .isEqualTo("sha256=bc08c591847b765241711bcbe7067e3869a219e424d3fdd9d00b3b6f915baf97");
    }

    @Test
    @DisplayName("un autre horodatage donne une autre signature (un envoi rejoué plus tard ne se vérifie pas)")
    void timestamp_is_signed() {
        assertThat(WebhookSignature.sign("whsec_test", 1_700_000_001L, "{\"type\":\"ping\"}"))
            .isNotEqualTo(WebhookSignature.sign("whsec_test", 1_700_000_000L, "{\"type\":\"ping\"}"));
    }

    @Test
    @DisplayName("nouveau secret : préfixe whsec_ et 32 octets aléatoires, jamais deux fois le même")
    void new_secret_is_random() {
        String a = WebhookSignature.newSecret();
        String b = WebhookSignature.newSecret();

        assertThat(a).startsWith("whsec_").isNotEqualTo(b);
        assertThat(Base64.getUrlDecoder().decode(a.substring("whsec_".length()))).hasSize(32);
    }
}
