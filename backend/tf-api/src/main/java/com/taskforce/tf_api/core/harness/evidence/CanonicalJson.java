package com.taskforce.tf_api.core.harness.evidence;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * JSON canonique du dossier de preuve (contracts/README.md) : clés triées par unités UTF-16, aucun espace, entiers
 * seulement, chaînes échappées exactement comme {@code JSON.stringify} d'ECMAScript. Le runner produit la même
 * chaîne : les cas de contracts/evidence/chain-cases.json le prouvent.
 */
public final class CanonicalJson {

    private CanonicalJson() {
    }

    public static String of(JsonNode node) {
        StringBuilder out = new StringBuilder();
        write(node, out);
        return out.toString();
    }

    private static void write(JsonNode node, StringBuilder out) {
        switch (node.getNodeType()) {
            case NULL -> out.append("null");
            case BOOLEAN -> out.append(node.booleanValue());
            case NUMBER -> {
                if (!node.isIntegralNumber()) {
                    throw new IllegalArgumentException("Decimal numbers are not allowed in evidence events.");
                }
                out.append(node.bigIntegerValue());
            }
            case STRING -> quote(node.textValue(), out);
            case ARRAY -> {
                out.append('[');
                for (int i = 0; i < node.size(); i++) {
                    if (i > 0) {
                        out.append(',');
                    }
                    write(node.get(i), out);
                }
                out.append(']');
            }
            case OBJECT -> {
                List<String> keys = new ArrayList<>();
                node.fieldNames().forEachRemaining(keys::add);
                // String.compareTo compare les unités UTF-16, comme le tri par défaut de JavaScript.
                Collections.sort(keys);
                out.append('{');
                for (int i = 0; i < keys.size(); i++) {
                    if (i > 0) {
                        out.append(',');
                    }
                    quote(keys.get(i), out);
                    out.append(':');
                    write(node.get(keys.get(i)), out);
                }
                out.append('}');
            }
            default -> throw new IllegalArgumentException("Unsupported JSON node: " + node.getNodeType());
        }
    }

    static void quote(String s, StringBuilder out) {
        out.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else if (Character.isHighSurrogate(c) && i + 1 < s.length()
                        && Character.isLowSurrogate(s.charAt(i + 1))) {
                        out.append(c).append(s.charAt(i + 1));
                        i++;
                    } else if (Character.isSurrogate(c)) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        out.append('"');
    }
}
