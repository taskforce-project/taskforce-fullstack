package com.taskforce.tf_api.core.harness.evidence;

import java.math.BigInteger;
import java.util.Iterator;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Ce qui entre au dossier est du I-JSON (RFC 7493), comme la RFC 8785 l'exige de ce qu'elle canonise : sur ces valeurs,
 * {@link CanonicalJson} écrit exactement ce qu'écrit la RFC 8785, et une bibliothèque JCS quelconque retrouve les mêmes
 * empreintes (contracts/README.md). Trois écarts possibles avec la RFC, corrigés ici, à l'entrée :
 * <ul>
 *   <li>une moitié de paire de substitution seule (un texte coupé au milieu d'un caractère) : la RFC 8785 refuse, le
 *   canoniseur l'échapperait ; elle devient U+FFFD ;</li>
 *   <li>un entier hors de ±(2^53−1) : la RFC l'écrirait en double, arrondi, et le runner le lirait arrondi ; il devient
 *   une chaîne ;</li>
 *   <li>un décimal, que le dossier refuse : il devient une chaîne.</li>
 * </ul>
 * Un fichier écrit avant cette entrée peut encore porter une moitié de paire échappée : {@link CanonicalJson} la lit
 * toujours comme {@code JSON.stringify}, pour que la vérification d'un ancien dossier tienne.
 */
public final class EvidenceIntake {

    /** Le plus grand entier qu'un double représente exactement : {@code Number.MAX_SAFE_INTEGER}. */
    public static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
    private static final BigInteger MAX = BigInteger.valueOf(MAX_SAFE_INTEGER);
    private static final BigInteger MIN = MAX.negate();
    private static final char REPLACEMENT = '�';

    private EvidenceIntake() {
    }

    /** Une copie de la valeur, en I-JSON : ce qui entrera dans l'empreinte. */
    public static JsonNode of(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return JsonNodeFactory.instance.nullNode();
        }
        return switch (node.getNodeType()) {
            case STRING -> JsonNodeFactory.instance.textNode(text(node.textValue()));
            case NUMBER -> number(node);
            case ARRAY -> {
                ArrayNode out = JsonNodeFactory.instance.arrayNode();
                node.forEach(item -> out.add(of(item)));
                yield out;
            }
            case OBJECT -> {
                ObjectNode out = JsonNodeFactory.instance.objectNode();
                Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
                while (fields.hasNext()) {
                    Map.Entry<String, JsonNode> field = fields.next();
                    out.set(text(field.getKey()), of(field.getValue()));
                }
                yield out;
            }
            case BOOLEAN -> JsonNodeFactory.instance.booleanNode(node.booleanValue());
            default -> JsonNodeFactory.instance.textNode(text(node.asText()));
        };
    }

    private static JsonNode number(JsonNode node) {
        if (!node.isIntegralNumber()) {
            return JsonNodeFactory.instance.textNode(node.asText());
        }
        BigInteger value = node.bigIntegerValue();
        if (value.compareTo(MAX) > 0 || value.compareTo(MIN) < 0) {
            return JsonNodeFactory.instance.textNode(value.toString());
        }
        return JsonNodeFactory.instance.numberNode(value.longValue());
    }

    /** Le texte sans moitié de paire de substitution seule : chacune devient U+FFFD. */
    public static String text(String s) {
        if (s == null) {
            return null;
        }
        StringBuilder out = null;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            boolean pair = Character.isHighSurrogate(c) && i + 1 < s.length() && Character.isLowSurrogate(s.charAt(i + 1));
            if (pair) {
                if (out != null) {
                    out.append(c).append(s.charAt(i + 1));
                }
                i++;
            } else if (Character.isSurrogate(c)) {
                if (out == null) {
                    out = new StringBuilder(s.length()).append(s, 0, i);
                }
                out.append(REPLACEMENT);
            } else if (out != null) {
                out.append(c);
            }
        }
        return out == null ? s : out.toString();
    }

    /** Vrai si la valeur est du I-JSON : ni moitié de paire seule, ni entier hors de la plage sûre, ni décimal. */
    public static boolean isIJson(JsonNode node) {
        if (node == null) {
            return true;
        }
        return switch (node.getNodeType()) {
            case STRING -> text(node.textValue()).equals(node.textValue());
            case NUMBER -> node.isIntegralNumber() && node.bigIntegerValue().compareTo(MAX) <= 0
                && node.bigIntegerValue().compareTo(MIN) >= 0;
            case ARRAY -> {
                for (JsonNode item : node) {
                    if (!isIJson(item)) {
                        yield false;
                    }
                }
                yield true;
            }
            case OBJECT -> {
                Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
                while (fields.hasNext()) {
                    Map.Entry<String, JsonNode> field = fields.next();
                    if (!text(field.getKey()).equals(field.getKey()) || !isIJson(field.getValue())) {
                        yield false;
                    }
                }
                yield true;
            }
            default -> true;
        };
    }

    /**
     * Un texte JSON où chaque moitié de paire de substitution seule devient {@code \}{@code uXXXX} (minuscules), comme le
     * JSON canonique l'écrit : relu, il donne la même valeur, et son UTF-8 n'a plus de « ? » à la place (R159, M7). Une
     * moitié seule ne peut être que dans une chaîne : la structure du JSON est en ASCII.
     */
    public static String escapeLoneSurrogates(String json) {
        StringBuilder out = null;
        for (int i = 0; i < json.length(); i++) {
            char c = json.charAt(i);
            if (Character.isHighSurrogate(c) && i + 1 < json.length() && Character.isLowSurrogate(json.charAt(i + 1))) {
                if (out != null) {
                    out.append(c).append(json.charAt(i + 1));
                }
                i++;
            } else if (Character.isSurrogate(c)) {
                if (out == null) {
                    out = new StringBuilder(json.length() + 16).append(json, 0, i);
                }
                out.append(String.format("\\u%04x", (int) c));
            } else if (out != null) {
                out.append(c);
            }
        }
        return out == null ? json : out.toString();
    }

    /**
     * Le texte borné à {@code max} unités, coupé sur une frontière de caractère : une coupe ne laisse jamais une moitié
     * de paire de substitution. Plus long, il finit par « ... ».
     */
    public static String clip(String text, int max) {
        if (text == null || text.length() <= max) {
            return text;
        }
        int end = Math.max(0, max - 3);
        if (end > 0 && Character.isHighSurrogate(text.charAt(end - 1))) {
            end--;
        }
        return text.substring(0, end) + "...";
    }
}
