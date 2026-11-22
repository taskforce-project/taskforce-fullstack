package com.taskforce.tf_api.core.harness.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigInteger;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Ce qui entre au dossier est du I-JSON (RFC 7493), comme la RFC 8785 l'exige : sur ces valeurs, le JSON canonique du
 * dossier est celui de la RFC, et un outil JCS quelconque retrouve les mêmes empreintes.
 */
@DisplayName("Entrée au dossier : du I-JSON, comme la RFC 8785 le demande")
class EvidenceIntakeTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    @DisplayName("une moitié de paire de substitution seule devient U+FFFD : la RFC 8785 refuserait la valeur")
    void a_lone_surrogate_becomes_the_replacement_character() {
        ObjectNode data = JsonNodeFactory.instance.objectNode();
        data.put("text", "coupé au milieu \uD83D");
        data.put("\uDE00clé", "valeur");

        JsonNode clean = EvidenceIntake.of(data);

        assertThat(clean.get("text").asText()).isEqualTo("coupé au milieu �");
        assertThat(clean.has("�clé")).isTrue();
        assertThat(EvidenceIntake.isIJson(data)).isFalse();
        assertThat(EvidenceIntake.isIJson(clean)).isTrue();
        // Une paire entière reste telle quelle.
        assertThat(EvidenceIntake.text("fusée 🚀")).isEqualTo("fusée 🚀");
    }

    @Test
    @DisplayName("un entier hors de ±(2^53−1) et un décimal deviennent des chaînes : le runner les lirait arrondis")
    void unsafe_numbers_become_strings() throws Exception {
        JsonNode data = JSON.readTree("{\"big\": 9007199254740993, \"safe\": 9007199254740991, \"neg\": -9007199254740992,"
            + " \"half\": 0.5, \"list\": [1, 2.5]}");

        JsonNode clean = EvidenceIntake.of(data);

        assertThat(clean.get("big").isTextual()).isTrue();
        assertThat(clean.get("big").asText()).isEqualTo(new BigInteger("9007199254740993").toString());
        assertThat(clean.get("safe").isIntegralNumber()).isTrue();
        assertThat(clean.get("neg").asText()).isEqualTo("-9007199254740992");
        assertThat(clean.get("half").asText()).isEqualTo("0.5");
        assertThat(clean.get("list").get(1).asText()).isEqualTo("2.5");
        assertThat(EvidenceIntake.isIJson(data)).isFalse();
        assertThat(EvidenceIntake.isIJson(clean)).isTrue();
        // Le JSON canonique accepte alors la valeur, là où il refusait le décimal.
        assertThat(CanonicalJson.of(clean)).contains("\"half\":\"0.5\"");
    }

    @Test
    @DisplayName("null, booléens et objets vides passent tels quels")
    void plain_values_pass() throws Exception {
        JsonNode data = JSON.readTree("{\"a\": null, \"b\": true, \"c\": {}, \"d\": []}");

        assertThat(CanonicalJson.of(EvidenceIntake.of(data))).isEqualTo("{\"a\":null,\"b\":true,\"c\":{},\"d\":[]}");
        assertThat(EvidenceIntake.of(null).isNull()).isTrue();
        assertThat(EvidenceIntake.text(null)).isNull();
    }

    @ParameterizedTest(name = "« {0} » coupé à {1} → « {2} »")
    @CsvSource(delimiter = '|', value = {
        "abcdef|10|abcdef",
        "abcdefghijkl|8|abcde...",
    })
    @DisplayName("une coupe finit par « ... »")
    void clip_adds_an_ellipsis(String text, int max, String expected) {
        assertThat(EvidenceIntake.clip(text, max)).isEqualTo(expected);
    }

    @Test
    @DisplayName("une coupe ne laisse jamais une moitié de paire de substitution")
    void clip_keeps_pairs_whole() {
        String text = "ab🚀cd";
        // « ab », puis la paire de 🚀 : couper à 6 unités garderait sa moitié haute avant « ... ».
        String clipped = EvidenceIntake.clip(text + "efgh", 6);

        assertThat(clipped).isEqualTo("ab...");
        assertThat(EvidenceIntake.text(clipped)).isEqualTo(clipped);
        assertThat(EvidenceIntake.clip(null, 3)).isNull();
    }
}
