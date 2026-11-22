package com.taskforce.tf_api.core.harness.evidence;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.HexFormat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Le sceau d'un dossier (contracts/README.md, « Seal ») : aucun format propre. C'est un énoncé in-toto (Statement v1)
 * dont le sujet est la tête de la chaîne, signé en Ed25519 sous une enveloppe DSSE, celle que les outils de la chaîne
 * d'approvisionnement lisent déjà (E34). Ed25519 parce que c'est la signature de la boîte à outils de Microsoft relevée
 * au dossier de la séance n°29, qu'elle est dans le JDK et dans Node sans dépendance, qu'elle est déterministe, et que sa
 * clé publique tient en 32 octets. L'énoncé porte l'en-tête, la tête de la chaîne, son rang, l'heure du sceau, et la clé
 * publique avec ce qu'on sait de l'endroit où vit la clé privée ({@code custody}).
 *
 * <p>Ce qu'un sceau prouve : que la clé qui l'a signé a vu cette chaîne jusqu'à ce rang. Il ne prouve rien de plus que
 * ce que vaut la garde de la clé : un sceau dont la clé est sur la machine de l'agent le dit lui-même.</p>
 */
public final class EvidenceSeal {

    public static final String FORMAT = "taskforce-evidence/1";
    public static final String PAYLOAD_TYPE = "application/vnd.in-toto+json";
    public static final String STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
    public static final String PREDICATE_TYPE = "https://taskforce-project.fr/contracts/taskforce-evidence/1";
    public static final String ALGORITHM = "ed25519";
    /** La clé privée est sur la même machine que l'agent, ou rien ne dit le contraire. */
    public static final String SAME_MACHINE = "same-machine";
    /** L'exploitant déclare que la clé privée vit sur une machine où aucun agent ne tourne. TaskForce ne le vérifie pas. */
    public static final String SEPARATE_MACHINE = "separate-machine";

    private static final ObjectMapper JSON = new ObjectMapper();

    private EvidenceSeal() {
    }

    /**
     * La clé qui scelle.
     *
     * @param id        {@code sha256:} et l'empreinte de la clé publique (SubjectPublicKeyInfo, DER)
     * @param publicKey la clé publique, SubjectPublicKeyInfo en DER, en base64
     * @param custody   {@link #SAME_MACHINE} ou {@link #SEPARATE_MACHINE}
     * @param kept      la clé est gardée d'un démarrage à l'autre : l'exploitant peut la publier ; sinon elle a été tirée
     *                  au démarrage du serveur et perdue à son arrêt
     */
    public record Key(String id, String publicKey, String custody, boolean kept) {
    }

    /** L'énoncé in-toto du sceau : la tête de la chaîne pour sujet, l'en-tête et la clé pour prédicat. */
    public static ObjectNode statement(JsonNode header, String root, int seq, String sealedAt, Key key) {
        ObjectNode statement = JsonNodeFactory.instance.objectNode();
        statement.put("_type", STATEMENT_TYPE);
        ArrayNode subject = statement.putArray("subject");
        ObjectNode chain = subject.addObject();
        chain.put("name", "taskforce-mission-" + header.path("id").asText("unknown"));
        chain.putObject("digest").put("sha256", root.startsWith("sha256:") ? root.substring("sha256:".length()) : root);
        statement.put("predicateType", PREDICATE_TYPE);
        ObjectNode predicate = statement.putObject("predicate");
        predicate.put("format", FORMAT);
        predicate.set("mission", header.deepCopy());
        predicate.put("root", root);
        predicate.put("seq", seq);
        predicate.put("sealedAt", sealedAt);
        ObjectNode signer = predicate.putObject("key");
        signer.put("id", key.id());
        signer.put("algorithm", ALGORITHM);
        signer.put("publicKey", key.publicKey());
        signer.put("custody", key.custody());
        signer.put("kept", key.kept());
        return statement;
    }

    /** Les octets signés de l'énoncé : son JSON canonique, en UTF-8. */
    public static byte[] payload(JsonNode statement) {
        return CanonicalJson.of(statement).getBytes(StandardCharsets.UTF_8);
    }

    /** L'encodage préalable à la signature de DSSE (PAE) : {@code DSSEv1 <len> <type> <len> <corps>}, longueurs en octets. */
    public static byte[] pae(String payloadType, byte[] payload) {
        byte[] type = payloadType.getBytes(StandardCharsets.UTF_8);
        byte[] head = ("DSSEv1 " + type.length + " " + payloadType + " " + payload.length + " ").getBytes(StandardCharsets.UTF_8);
        byte[] out = new byte[head.length + payload.length];
        System.arraycopy(head, 0, out, 0, head.length);
        System.arraycopy(payload, 0, out, head.length, payload.length);
        return out;
    }

    /** L'enveloppe DSSE : l'énoncé en base64, son type, la signature et l'identifiant de la clé. */
    public static ObjectNode envelope(byte[] payload, String keyId, byte[] signature) {
        ObjectNode envelope = JsonNodeFactory.instance.objectNode();
        envelope.put("payload", Base64.getEncoder().encodeToString(payload));
        envelope.put("payloadType", PAYLOAD_TYPE);
        ObjectNode sig = envelope.putArray("signatures").addObject();
        sig.put("keyid", keyId);
        sig.put("sig", Base64.getEncoder().encodeToString(signature));
        return envelope;
    }

    /** L'identifiant d'une clé publique : {@code sha256:} et l'empreinte de son SubjectPublicKeyInfo en DER. */
    public static String keyId(byte[] subjectPublicKeyInfo) {
        try {
            return "sha256:" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(subjectPublicKeyInfo));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }

    /**
     * Ce qu'une enveloppe dit, une fois ouverte : la signature tient-elle avec la clé publique qu'elle porte, et l'énoncé.
     * Une signature valide ne dit pas qu'il faut croire la clé : cela se compare à la clé que l'exploitant publie.
     */
    public record Opened(boolean valid, String reason, ObjectNode statement, String keyId) {
    }

    public static Opened open(JsonNode envelope) {
        try {
            if (envelope == null || !PAYLOAD_TYPE.equals(envelope.path("payloadType").asText())) {
                return new Opened(false, "Not a DSSE envelope of an in-toto statement.", null, null);
            }
            byte[] payload = Base64.getDecoder().decode(envelope.path("payload").asText(""));
            JsonNode signatures = envelope.path("signatures");
            if (!signatures.isArray() || signatures.isEmpty()) {
                return new Opened(false, "The envelope carries no signature.", null, null);
            }
            JsonNode parsed = JSON.readTree(payload);
            if (!(parsed instanceof ObjectNode statement) || !STATEMENT_TYPE.equals(statement.path("_type").asText())
                || !PREDICATE_TYPE.equals(statement.path("predicateType").asText())) {
                return new Opened(false, "The envelope does not hold a TaskForce evidence statement.", null, null);
            }
            JsonNode key = statement.path("predicate").path("key");
            if (!ALGORITHM.equals(key.path("algorithm").asText())) {
                return new Opened(false, "The seal is not an Ed25519 signature.", statement, null);
            }
            byte[] spki = Base64.getDecoder().decode(key.path("publicKey").asText(""));
            String id = keyId(spki);
            if (!id.equals(key.path("id").asText())) {
                return new Opened(false, "The key id does not match the public key.", statement, id);
            }
            PublicKey publicKey = KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(spki));
            for (JsonNode sig : signatures) {
                if (!id.equals(sig.path("keyid").asText())) {
                    continue;
                }
                Signature verifier = Signature.getInstance("Ed25519");
                verifier.initVerify(publicKey);
                verifier.update(pae(PAYLOAD_TYPE, payload));
                if (verifier.verify(Base64.getDecoder().decode(sig.path("sig").asText("")))) {
                    return new Opened(true, null, statement, id);
                }
                return new Opened(false, "The signature does not hold: the statement was changed after it was sealed.", statement, id);
            }
            return new Opened(false, "No signature of the key the statement names.", statement, id);
        } catch (IllegalArgumentException | GeneralSecurityException | java.io.IOException e) {
            return new Opened(false, "The envelope cannot be read: " + e.getMessage(), null, null);
        }
    }
}
