package com.taskforce.tf_api.core.harness.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Base64;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Le sceau d'un dossier : aucun format propre, un énoncé in-toto signé en Ed25519 sous une enveloppe DSSE (E34). Une
 * signature valide tient avec la clé que l'énoncé porte ; un énoncé, une signature ou une clé changés ne tiennent plus.
 */
@DisplayName("Le sceau d'un dossier : in-toto, DSSE, Ed25519")
class EvidenceSealTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String ROOT = "sha256:" + "c".repeat(64);

    private KeyPair keys;
    private EvidenceSeal.Key key;
    private ObjectNode header;

    @BeforeEach
    void setUp() throws Exception {
        keys = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        byte[] spki = keys.getPublic().getEncoded();
        key = new EvidenceSeal.Key(EvidenceSeal.keyId(spki), Base64.getEncoder().encodeToString(spki), EvidenceSeal.SAME_MACHINE, true);
        header = (ObjectNode) JSON.readTree("{\"id\":42,\"workspace\":\"acme\",\"issue\":\"WEB-12\"}");
    }

    private ObjectNode sealed(ObjectNode statement) throws Exception {
        byte[] payload = EvidenceSeal.payload(statement);
        Signature signer = Signature.getInstance("Ed25519");
        signer.initSign(keys.getPrivate());
        signer.update(EvidenceSeal.pae(EvidenceSeal.PAYLOAD_TYPE, payload));
        return EvidenceSeal.envelope(payload, key.id(), signer.sign());
    }

    @Test
    @DisplayName("l'encodage préalable de DSSE : l'exemple de la spécification")
    void pae_follows_the_dsse_specification() {
        byte[] pae = EvidenceSeal.pae("http://example.com/HelloWorld", "hello world".getBytes(StandardCharsets.UTF_8));

        assertThat(new String(pae, StandardCharsets.UTF_8)).isEqualTo("DSSEv1 29 http://example.com/HelloWorld 11 hello world");
    }

    @Test
    @DisplayName("l'énoncé : la tête de la chaîne pour sujet, l'en-tête, le rang, l'heure et la clé pour prédicat")
    void the_statement_is_an_in_toto_statement() {
        ObjectNode statement = EvidenceSeal.statement(header, ROOT, 7, "2026-11-22T10:00:00.000Z", key);

        assertThat(statement.get("_type").asText()).isEqualTo("https://in-toto.io/Statement/v1");
        assertThat(statement.get("subject").get(0).get("name").asText()).isEqualTo("taskforce-mission-42");
        assertThat(statement.get("subject").get(0).get("digest").get("sha256").asText()).isEqualTo("c".repeat(64));
        assertThat(statement.get("predicateType").asText()).isEqualTo(EvidenceSeal.PREDICATE_TYPE);
        assertThat(statement.get("predicate").get("mission")).isEqualTo(header);
        assertThat(statement.get("predicate").get("root").asText()).isEqualTo(ROOT);
        assertThat(statement.get("predicate").get("seq").asInt()).isEqualTo(7);
        assertThat(statement.get("predicate").get("key").get("custody").asText()).isEqualTo("same-machine");
        assertThat(statement.get("predicate").get("key").get("kept").asBoolean()).isTrue();
    }

    @Test
    @DisplayName("une enveloppe intacte s'ouvre, et dit sa clé")
    void an_intact_envelope_opens() throws Exception {
        EvidenceSeal.Opened opened = EvidenceSeal.open(sealed(EvidenceSeal.statement(header, ROOT, 7, "2026-11-22T10:00:00.000Z", key)));

        assertThat(opened.valid()).isTrue();
        assertThat(opened.keyId()).isEqualTo(key.id());
        assertThat(opened.statement().get("predicate").get("root").asText()).isEqualTo(ROOT);
    }

    @Test
    @DisplayName("un énoncé changé après le sceau ne tient plus")
    void a_changed_statement_does_not_hold() throws Exception {
        ObjectNode envelope = sealed(EvidenceSeal.statement(header, ROOT, 7, "2026-11-22T10:00:00.000Z", key));
        ObjectNode forged = EvidenceSeal.statement((ObjectNode) JSON.readTree("{\"id\":42,\"workspace\":\"evil\"}"), ROOT, 7,
            "2026-11-22T10:00:00.000Z", key);
        envelope.put("payload", Base64.getEncoder().encodeToString(EvidenceSeal.payload(forged)));

        EvidenceSeal.Opened opened = EvidenceSeal.open(envelope);

        assertThat(opened.valid()).isFalse();
        assertThat(opened.reason()).contains("changed after it was sealed");
    }

    @Test
    @DisplayName("une autre clé glissée dans l'énoncé ne correspond plus à son identifiant")
    void a_swapped_key_is_seen() throws Exception {
        KeyPair other = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        EvidenceSeal.Key lying = new EvidenceSeal.Key(key.id(), Base64.getEncoder().encodeToString(other.getPublic().getEncoded()),
            EvidenceSeal.SAME_MACHINE, true);

        EvidenceSeal.Opened opened = EvidenceSeal.open(sealed(EvidenceSeal.statement(header, ROOT, 7, "2026-11-22T10:00:00.000Z", lying)));

        assertThat(opened.valid()).isFalse();
        assertThat(opened.reason()).contains("key id does not match");
    }

    @Test
    @DisplayName("ce qui n'est pas une enveloppe DSSE d'un dossier ne s'ouvre pas")
    void other_documents_do_not_open() throws Exception {
        assertThat(EvidenceSeal.open(JSON.readTree("{\"payloadType\":\"text/plain\"}")).valid()).isFalse();
        assertThat(EvidenceSeal.open(JSON.readTree("{\"payloadType\":\"application/vnd.in-toto+json\",\"payload\":\"e30=\","
            + "\"signatures\":[]}")).reason()).contains("no signature");
        assertThat(EvidenceSeal.open(JSON.readTree("{\"payloadType\":\"application/vnd.in-toto+json\",\"payload\":\"e30=\","
            + "\"signatures\":[{\"keyid\":\"x\",\"sig\":\"AA==\"}]}")).reason()).contains("TaskForce evidence statement");
        assertThat(EvidenceSeal.open(null).valid()).isFalse();
    }
}
