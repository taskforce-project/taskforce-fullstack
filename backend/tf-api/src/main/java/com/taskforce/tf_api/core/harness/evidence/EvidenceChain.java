package com.taskforce.tf_api.core.harness.evidence;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Chaîne d'empreintes du dossier de preuve (contracts/README.md) : l'empreinte d'un événement est le SHA-256 de
 * l'empreinte précédente, d'un saut de ligne, puis du JSON canonique de l'événement sans son champ {@code hash}.
 * Calculée par le serveur à la réception, dans l'ordre : le runner ne peut pas réécrire l'histoire.
 */
public final class EvidenceChain {

    public static final String ZERO_HASH = "sha256:" + "0".repeat(64);

    /** L'heure d'un événement, telle qu'elle entre dans l'empreinte : ISO-8601, UTC, à la milliseconde. */
    public static final DateTimeFormatter AT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
        .withZone(ZoneOffset.UTC);

    private static final ObjectMapper JSON = new ObjectMapper();

    private EvidenceChain() {
    }

    /**
     * Un événement du dossier, avant chaînage (contracts/evidence) : la même forme pour le dossier d'une mission et
     * pour celui d'une réponse de Cortex, l'agent interne.
     */
    public static ObjectNode event(int seq, String at, String type, String actorKind, String actorId, JsonNode data) {
        ObjectNode event = JSON.createObjectNode();
        event.put("seq", seq);
        event.put("at", at);
        event.put("type", type);
        ObjectNode actor = event.putObject("actor");
        actor.put("kind", actorKind);
        actor.put("id", actorId);
        event.set("data", data);
        return event;
    }

    public static String sha256(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            return "sha256:" + HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }

    /** L'événement chaîné : une copie avec {@code prev} et {@code hash} ; l'original n'est pas modifié. */
    public static ObjectNode link(String prev, ObjectNode event) {
        ObjectNode chained = event.deepCopy();
        chained.remove("hash");
        chained.put("prev", prev);
        chained.put("hash", sha256(prev + "\n" + CanonicalJson.of(chained)));
        return chained;
    }

    public static List<ObjectNode> chain(List<ObjectNode> events) {
        List<ObjectNode> out = new ArrayList<>(events.size());
        String prev = ZERO_HASH;
        for (ObjectNode event : events) {
            ObjectNode chained = link(prev, event);
            out.add(chained);
            prev = chained.get("hash").asText();
        }
        return out;
    }

    /** Recalcule la chaîne : rend l'indice du premier événement qui ne tient pas, ou -1 si tout tient. */
    public static int firstBrokenLink(List<ObjectNode> events) {
        String prev = ZERO_HASH;
        for (int i = 0; i < events.size(); i++) {
            ObjectNode event = events.get(i);
            String claimedPrev = event.path("prev").asText(null);
            String claimedHash = event.path("hash").asText(null);
            ObjectNode input = event.deepCopy();
            input.remove("prev");
            if (!prev.equals(claimedPrev) || !link(prev, input).get("hash").asText().equals(claimedHash)) {
                return i;
            }
            prev = claimedHash;
        }
        return -1;
    }
}
