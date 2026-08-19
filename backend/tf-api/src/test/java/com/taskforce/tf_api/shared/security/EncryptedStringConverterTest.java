package com.taskforce.tf_api.shared.security;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.env.Environment;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests unitaires — {@link EncryptedStringConverter} (chiffrement au repos AES-256-GCM, RGPD C11.2)
 * et {@link EncryptionKeyHolder} (injection de la clé au démarrage).
 *
 * <p>La clé est un état statique volatile partagé : chaque test la configure explicitement et le
 * {@code @AfterEach} la désactive pour ne pas fuiter sur les autres tests (défaut = clair désactivé).</p>
 */
@DisplayName("EncryptedStringConverter (AES-GCM au repos)")
class EncryptedStringConverterTest {

    private final EncryptedStringConverter converter = new EncryptedStringConverter();

    @AfterEach
    void disableKey() {
        EncryptedStringConverter.configure(null); // état par défaut des tests : chiffrement off
    }

    @Test
    @DisplayName("round-trip : chiffre (préfixe enc:) puis déchiffre à l'identique")
    void round_trip_encrypt_decrypt() {
        EncryptedStringConverter.configure("ma-clef-secrete-de-test");

        String clear = "Jean Dupont — 06 12 34 56 78";
        String cipher = converter.convertToDatabaseColumn(clear);

        assertThat(cipher).startsWith("enc:").isNotEqualTo(clear);
        assertThat(converter.convertToEntityAttribute(cipher)).isEqualTo(clear);
    }

    @Test
    @DisplayName("IV aléatoire : deux chiffrements du même clair produisent des sorties différentes")
    void non_deterministic_iv() {
        EncryptedStringConverter.configure("clef");
        String a = converter.convertToDatabaseColumn("secret");
        String b = converter.convertToDatabaseColumn("secret");
        assertThat(a).isNotEqualTo(b);
        assertThat(converter.convertToEntityAttribute(a)).isEqualTo("secret");
        assertThat(converter.convertToEntityAttribute(b)).isEqualTo("secret");
    }

    @Test
    @DisplayName("null est renvoyé tel quel (chiffrement et déchiffrement)")
    void null_passthrough() {
        EncryptedStringConverter.configure("clef");
        assertThat(converter.convertToDatabaseColumn(null)).isNull();
        assertThat(converter.convertToEntityAttribute(null)).isNull();
    }

    @Test
    @DisplayName("sans clé configurée : passe-plat (aucun chiffrement)")
    void passthrough_when_key_absent() {
        EncryptedStringConverter.configure(""); // vide → clé désactivée
        assertThat(converter.convertToDatabaseColumn("clair")).isEqualTo("clair");
        assertThat(converter.convertToEntityAttribute("clair")).isEqualTo("clair");
    }

    @Test
    @DisplayName("lecture tolérante : une valeur legacy sans préfixe enc: est renvoyée telle quelle")
    void legacy_plaintext_read_as_is() {
        EncryptedStringConverter.configure("clef");
        assertThat(converter.convertToEntityAttribute("valeur-legacy-claire")).isEqualTo("valeur-legacy-claire");
    }

    @Test
    @DisplayName("déchiffrement tolérant : un chiffré corrompu ne casse pas la lecture (renvoie l'entrée)")
    void corrupted_ciphertext_returns_input() {
        EncryptedStringConverter.configure("clef");
        String garbage = "enc:!!!not-base64!!!";
        assertThat(converter.convertToEntityAttribute(garbage)).isEqualTo(garbage);
    }

    @Test
    @DisplayName("configure(blank) désactive : un chiffré antérieur devient illisible → renvoyé tel quel")
    void reconfigure_blank_disables() {
        EncryptedStringConverter.configure("clef-A");
        String cipher = converter.convertToDatabaseColumn("données");
        EncryptedStringConverter.configure("   "); // blanc → désactive
        assertThat(converter.convertToEntityAttribute(cipher)).isEqualTo(cipher); // clé null → tel quel
    }

    /** Environnement Spring simulé avec les profils actifs voulus. */
    private static Environment profils(String... actifs) {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles(actifs);
        return env;
    }

    @Test
    @DisplayName("EncryptionKeyHolder configure la clé du converter à la construction")
    void key_holder_configures_converter() {
        new EncryptionKeyHolder("clef-via-holder", profils("dev"));
        String cipher = converter.convertToDatabaseColumn("via-holder");
        assertThat(cipher).startsWith("enc:");
        assertThat(converter.convertToEntityAttribute(cipher)).isEqualTo("via-holder");
    }

    @Test
    @DisplayName("hors production, un secret vide laisse le chiffrement désactivé sans échouer")
    void key_holder_empty_disables_outside_production() {
        new EncryptionKeyHolder("", profils("dev"));
        assertThat(converter.convertToDatabaseColumn("clair")).isEqualTo("clair");
    }

    /**
     * Garde de production. Le placeholder {@code ${TF_ENCRYPTION_KEY}} sans valeur par défaut ne
     * suffit pas : Spring n'échoue que sur une propriété <b>absente</b>, jamais sur une propriété
     * <b>vide</b> — et Docker Compose transmet précisément une chaîne vide quand la variable existe
     * sans valeur. Ce test fige la seule garde qui tienne : celle qui teste la valeur.
     */
    @ParameterizedTest(name = "clé = {0} → démarrage refusé en prod")
    @DisplayName("en production, une clé absente ou vide empêche le démarrage")
    @NullSource
    @ValueSource(strings = { "", "   " })
    void key_holder_refuses_to_start_in_production_without_key(String cleAbsente) {
        assertThatThrownBy(() -> new EncryptionKeyHolder(cleAbsente, profils("prod")))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("TF_ENCRYPTION_KEY");
    }

    @Test
    @DisplayName("en production, une clé renseignée active le chiffrement")
    void key_holder_starts_in_production_with_key() {
        new EncryptionKeyHolder("clef-de-production", profils("prod"));
        assertThat(converter.convertToDatabaseColumn("secret")).startsWith("enc:");
    }
}
