package com.taskforce.tf_api.core.harness.evidence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * La clé qui scelle les dossiers : de l'environnement ou d'un fichier, jamais du code ; une clé tirée au démarrage quand
 * rien n'est donné, et le sceau le dit ; sa garde telle que l'exploitant la déclare.
 */
@DisplayName("La clé qui scelle les dossiers")
class EvidenceSignerTest {

    @TempDir
    Path dir;

    private static boolean verifies(EvidenceSigner signer, byte[] data, byte[] signature) throws Exception {
        Signature verifier = Signature.getInstance("Ed25519");
        verifier.initVerify(KeyFactory.getInstance("Ed25519")
            .generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(signer.key().publicKey()))));
        verifier.update(data);
        return verifier.verify(signature);
    }

    @Test
    @DisplayName("sans clé donnée : une clé tirée au démarrage, qui signe, et que le sceau dit non gardée")
    void without_a_key_one_is_drawn() throws Exception {
        EvidenceSigner signer = new EvidenceSigner("", "", "");
        byte[] data = "pae".getBytes(StandardCharsets.UTF_8);

        assertThat(signer.kept()).isFalse();
        assertThat(signer.key().kept()).isFalse();
        assertThat(signer.key().id()).startsWith("sha256:").hasSize(71);
        assertThat(signer.key().custody()).isEqualTo(EvidenceSeal.SAME_MACHINE);
        assertThat(verifies(signer, data, signer.sign(data))).isTrue();
    }

    @Test
    @DisplayName("un fichier absent se crée avec une clé neuve, et se relit au démarrage suivant : même clé")
    void a_key_file_is_created_then_read_again() throws Exception {
        Path file = dir.resolve("evidence").resolve("signing-key.pem");

        EvidenceSigner first = new EvidenceSigner("", file.toString(), "separate-machine");
        EvidenceSigner again = new EvidenceSigner("", file.toString(), "separate-machine");

        assertThat(Files.readString(file)).startsWith("-----BEGIN PRIVATE KEY-----");
        assertThat(again.key().id()).isEqualTo(first.key().id());
        assertThat(again.kept()).isTrue();
        assertThat(again.key().custody()).isEqualTo(EvidenceSeal.SEPARATE_MACHINE);
        byte[] data = "pae".getBytes(StandardCharsets.UTF_8);
        assertThat(verifies(first, data, again.sign(data))).isTrue();
    }

    @Test
    @DisplayName("une clé donnée en PEM ou en base64 (openssl genpkey -algorithm ed25519) : la même clé publique")
    void an_inline_key_in_pem_or_base64() throws Exception {
        Path file = dir.resolve("key.pem");
        EvidenceSigner fromFile = new EvidenceSigner("", file.toString(), "");
        String pem = Files.readString(file);
        String base64 = pem.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").strip();

        assertThat(new EvidenceSigner(pem, "", "").key().id()).isEqualTo(fromFile.key().id());
        assertThat(new EvidenceSigner(base64, "", "").key().id()).isEqualTo(fromFile.key().id());
    }

    @Test
    @DisplayName("une clé illisible arrête le démarrage, au lieu de signer avec une autre")
    void an_unreadable_key_stops_the_start() {
        assertThatThrownBy(() -> new EvidenceSigner("not a key", "", ""))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("cannot be read");
        assertThatThrownBy(() -> new EvidenceSigner("-----BEGIN PRIVATE KEY-----\nAAAA", "", ""))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("R159, M3 : sans clé donnée, le serveur garde la sienne dans le fichier par défaut de son volume, et la relit")
    void the_default_file_keeps_the_key_from_one_start_to_the_next() throws Exception {
        Path file = dir.resolve("var/lib/taskforce/evidence/signing-key.pem");

        EvidenceSigner first = new EvidenceSigner("", "", file.toString(), "");
        EvidenceSigner again = new EvidenceSigner("", "", file.toString(), "");

        assertThat(Files.readString(file)).startsWith("-----BEGIN PRIVATE KEY-----");
        assertThat(first.kept()).isTrue();
        assertThat(first.key().kept()).isTrue();
        assertThat(again.key().id()).isEqualTo(first.key().id());
    }

    @Test
    @DisplayName("R159, M3 : la clé donnée, ou son fichier, passe avant le fichier par défaut, qui n'est pas créé")
    void a_given_key_comes_before_the_default_file() throws Exception {
        Path given = dir.resolve("given.pem");
        Path fallback = dir.resolve("default.pem");
        EvidenceSigner fromGiven = new EvidenceSigner("", given.toString(), "");

        assertThat(new EvidenceSigner("", given.toString(), fallback.toString(), "").key().id()).isEqualTo(fromGiven.key().id());
        assertThat(new EvidenceSigner(Files.readString(given), "", fallback.toString(), "").key().id()).isEqualTo(fromGiven.key().id());
        assertThat(fallback).doesNotExist();
    }

    @Test
    @DisplayName("R159, M3 : un fichier par défaut qu'on ne peut pas créer n'arrête pas le serveur : une clé pour ce démarrage")
    void a_default_file_that_cannot_be_written_falls_back_to_a_drawn_key() throws Exception {
        // Son dossier est un fichier : rien ne s'y crée, même pour root.
        Path blocker = Files.writeString(dir.resolve("blocker"), "not a directory");

        EvidenceSigner signer = new EvidenceSigner("", "", blocker.resolve("signing-key.pem").toString(), "");

        assertThat(signer.kept()).isFalse();
        assertThat(signer.key().kept()).isFalse();
    }

    @Test
    @DisplayName("R159, M3 : un fichier par défaut qui ne porte pas une clé arrête le démarrage, comme une clé donnée")
    void a_default_file_that_is_not_a_key_stops_the_start() throws Exception {
        Path file = Files.writeString(dir.resolve("broken.pem"), "not a key");

        assertThatThrownBy(() -> new EvidenceSigner("", "", file.toString(), ""))
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("cannot be read");
    }

    @Test
    @DisplayName("la garde : separate-machine seulement quand l'exploitant le déclare ; tout le reste vaut same-machine")
    void custody_is_same_machine_unless_declared() {
        assertThat(EvidenceSigner.custodyOf("separate-machine")).isEqualTo(EvidenceSeal.SEPARATE_MACHINE);
        assertThat(EvidenceSigner.custodyOf(" Separate-Machine ")).isEqualTo(EvidenceSeal.SEPARATE_MACHINE);
        assertThat(EvidenceSigner.custodyOf("same-machine")).isEqualTo(EvidenceSeal.SAME_MACHINE);
        assertThat(EvidenceSigner.custodyOf("vault")).isEqualTo(EvidenceSeal.SAME_MACHINE);
        assertThat(EvidenceSigner.custodyOf(null)).isEqualTo(EvidenceSeal.SAME_MACHINE);
    }
}
