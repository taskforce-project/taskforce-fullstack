package com.taskforce.e16;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.teavm.jso.JSBody;
import org.teavm.jso.JSObject;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;

/**
 * Expérience E16, voie (b) : l'adaptateur entre JavaScript et le moteur Java. Il lit les objets JavaScript (paquet,
 * faits, valeur JSON) et les remet au moteur sous ses types Java ; il ne décide rien.
 */
final class JsBridge {

    private JsBridge() {
    }

    static JSObject answer(RulesEngine.Decision decision) {
        return pair(decision.effect(), decision.rule() == null ? null : decision.rule().id());
    }

    static Map<String, String> toFacts(JSObject facts) {
        Map<String, String> out = new HashMap<>();
        for (String key : keys(facts)) {
            String value = string(facts, key);
            if (value != null) {
                out.put(key, value);
            }
        }
        return out;
    }

    static List<Map<String, String>> toFactsList(JSObject factsList) {
        int n = length(factsList);
        List<Map<String, String>> all = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            all.add(toFacts(item(factsList, i)));
        }
        return all;
    }

    static RulesBundle toBundle(JSObject b) {
        JSObject rules = member(b, "rules");
        int n = length(rules);
        List<RulesBundle.Rule> list = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            JSObject r = item(rules, i);
            JSObject w = member(r, "when");
            RulesBundle.Condition when = new RulesBundle.Condition(string(w, "action"), string(w, "tool"),
                string(w, "command"), string(w, "path"), string(w, "branch"), string(w, "repoVisibility"),
                string(w, "server"), string(w, "sensitivity"));
            list.add(new RulesBundle.Rule(string(r, "id"), when, string(r, "class"), string(r, "effect"),
                string(r, "inverse"), string(r, "owner"), string(r, "reason"), string(r, "review")));
        }
        return new RulesBundle(string(b, "format"), string(b, "workspace"), null, integer(b, "version"),
            string(b, "digest"), string(b, "issuedAt"), list);
    }

    /** Une valeur JSON de JavaScript, en arbre Jackson (ce que lit RulesDigest). */
    static JsonNode toNode(JSObject value) {
        JsonNodeFactory f = JsonNodeFactory.instance;
        switch (kind(value)) {
            case "null":
                return f.nullNode();
            case "boolean":
                return f.booleanNode(bool(value));
            case "integer":
                return f.numberNode((long) doubleValue(value));
            case "number":
                return f.numberNode(doubleValue(value));
            case "string":
                return f.textNode(text(value));
            case "array": {
                ArrayNode out = f.arrayNode();
                int n = length(value);
                for (int i = 0; i < n; i++) {
                    out.add(toNode(item(value, i)));
                }
                return out;
            }
            default: {
                ObjectNode out = f.objectNode();
                for (String key : keys(value)) {
                    out.set(key, toNode(member(value, key)));
                }
                return out;
            }
        }
    }

    @JSBody(params = "o", script = "return Object.keys(o);")
    private static native String[] keys(JSObject o);

    @JSBody(params = { "o", "k" }, script = "var v = o[k]; return v === undefined || v === null ? null : String(v);")
    private static native String string(JSObject o, String k);

    @JSBody(params = { "o", "k" }, script = "return o[k] | 0;")
    private static native int integer(JSObject o, String k);

    @JSBody(params = { "o", "k" }, script = "return o[k];")
    private static native JSObject member(JSObject o, String k);

    @JSBody(params = "o", script = "return o.length;")
    private static native int length(JSObject o);

    @JSBody(params = { "o", "i" }, script = "return o[i];")
    private static native JSObject item(JSObject o, int i);

    @JSBody(params = { "e", "r" }, script = "return { effect: e, rule: r };")
    private static native JSObject pair(String effect, String rule);

    @JSBody(params = "v", script = "if (v === null || v === undefined) return 'null';"
        + " if (Array.isArray(v)) return 'array';"
        + " if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';"
        + " return typeof v;")
    private static native String kind(JSObject v);

    @JSBody(params = "v", script = "return v;")
    private static native boolean bool(JSObject v);

    @JSBody(params = "v", script = "return v;")
    private static native double doubleValue(JSObject v);

    @JSBody(params = "v", script = "return v;")
    private static native String text(JSObject v);
}
