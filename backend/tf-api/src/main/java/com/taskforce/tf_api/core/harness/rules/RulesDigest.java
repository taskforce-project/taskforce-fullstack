package com.taskforce.tf_api.core.harness.rules;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.harness.evidence.CanonicalJson;
import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;

/**
 * Empreinte d'un paquet de règles (contracts/README.md, règle 6) : SHA-256 du JSON canonique du paquet sans son champ
 * {@code digest} et sans aucun membre de valeur {@code null}, à tous les niveaux. Ainsi un champ nul que le JSON
 * envoyé au runner contient, ou omet, ne change pas l'empreinte.
 */
public final class RulesDigest {

    private RulesDigest() {
    }

    public static String of(JsonNode bundle) {
        JsonNode stripped = withoutNulls(bundle);
        if (stripped instanceof ObjectNode object) {
            object.remove("digest");
        }
        return EvidenceChain.sha256(CanonicalJson.of(stripped));
    }

    static JsonNode withoutNulls(JsonNode node) {
        if (node.isObject()) {
            ObjectNode out = JsonNodeFactory.instance.objectNode();
            List<String> keys = new ArrayList<>();
            node.fieldNames().forEachRemaining(keys::add);
            for (String key : keys) {
                JsonNode value = node.get(key);
                if (!value.isNull()) {
                    out.set(key, withoutNulls(value));
                }
            }
            return out;
        }
        if (node.isArray()) {
            ArrayNode out = JsonNodeFactory.instance.arrayNode();
            node.forEach(item -> out.add(withoutNulls(item)));
            return out;
        }
        return node;
    }
}
