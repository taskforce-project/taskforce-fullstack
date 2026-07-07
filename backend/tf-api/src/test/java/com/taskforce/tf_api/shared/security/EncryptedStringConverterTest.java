package com.taskforce.tf_api.shared.security;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

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

    @Test
    @DisplayName("EncryptionKeyHolder configure la clé du converter à la construction")
    void key_holder_configures_converter() {
        new EncryptionKeyHolder("clef-via-holder");
        String cipher = converter.convertToDatabaseColumn("via-holder");
        assertThat(cipher).startsWith("enc:");
        assertThat(converter.convertToEntityAttribute(cipher)).isEqualTo("via-holder");
    }

    @Test
    @DisplayName("EncryptionKeyHolder avec secret vide laisse le chiffrement désactivé")
    void key_holder_empty_disables() {
        new EncryptionKeyHolder("");
        assertThat(converter.convertToDatabaseColumn("clair")).isEqualTo("clair");
    }
}
