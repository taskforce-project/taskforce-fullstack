package com.taskforce.rules_engine_js;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import org.teavm.jso.JSBody;
import org.teavm.jso.JSObject;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;

/**
 * Les valeurs JavaScript du runner, lues en types du moteur Java, et l'inverse. Rien n'y décide : un paquet de règles
 * devient un {@link RulesBundle}, des faits une table, une valeur JSON un arbre Jackson (ce que lisent RulesDigest,
 * CanonicalJson et EvidenceChain), et un arbre Jackson redevient une valeur JavaScript.
 */
final class JsValues {

    private JsValues() {
    }

    /**
     * Un paquet {@code taskforce-rules/1}. Une condition absente ou nulle n'en pose pas, comme côté serveur ; une règle
     * sans {@code when} n'a pas de conditions du tout, et le moteur refuse de la juger, comme le serveur.
     */
    static RulesBundle bundle(JSObject b) {
        JSObject rules = member(b, "rules");
        int n = length(rules);
        List<RulesBundle.Rule> list = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            JSObject r = item(rules, i);
            JSObject w = member(r, "when");
            RulesBundle.Condition when = isObject(w)
                ? new RulesBundle.Condition(string(w, "action"), string(w, "tool"), string(w, "command"),
                    string(w, "path"), string(w, "branch"), string(w, "repoVisibility"), string(w, "server"),
                    string(w, "sensitivity"))
                : null;
            list.add(new RulesBundle.Rule(string(r, "id"), when, string(r, "class"), string(r, "effect"),
                string(r, "inverse"), string(r, "owner"), string(r, "reason"), string(r, "review")));
        }
        return new RulesBundle(string(b, "format"), string(b, "workspace"), null, integer(b, "version"),
            string(b, "digest"), string(b, "issuedAt"), list);
    }

    /** Ce qu'on sait d'une action, par nom de condition ; un fait nul est un fait absent. */
    static Map<String, String> facts(JSObject facts) {
        Map<String, String> out = new HashMap<>();
        for (String key : keys(facts)) {
            String value = string(facts, key);
            if (value != null) {
                out.put(key, value);
            }
        }
        return out;
    }

    static List<Map<String, String>> factsList(JSObject list) {
        int n = length(list);
        List<Map<String, String>> all = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            all.add(facts(item(list, i)));
        }
        return all;
    }

    /**
     * Une valeur JSON de JavaScript en arbre Jackson. Un nombre qui n'est pas entier reste décimal, et CanonicalJson le
     * refuse ; il devient un {@code DecimalNode}, pas un {@code DoubleNode}, dont l'écriture en texte (asText) demande
     * au JDK un constructeur de String que TeaVM n'a pas.
     */
    static JsonNode node(JSObject value) {
        JsonNodeFactory f = JsonNodeFactory.instance;
        switch (kind(value)) {
            case "null":
                return f.nullNode();
            case "boolean":
                return f.booleanNode(bool(value));
            case "integer":
                return f.numberNode((long) number(value));
            case "number":
                return f.numberNode(BigDecimal.valueOf(number(value)));
            case "string":
                return f.textNode(text(value));
            case "array": {
                ArrayNode out = f.arrayNode();
                int n = length(value);
                for (int i = 0; i < n; i++) {
                    out.add(node(item(value, i)));
                }
                return out;
            }
            default: {
                ObjectNode out = f.objectNode();
                for (String key : keys(value)) {
                    out.set(key, node(member(value, key)));
                }
                return out;
            }
        }
    }

    /** Une liste JavaScript d'objets (les événements d'un dossier), en nœuds Jackson. */
    static List<ObjectNode> objects(JSObject list) {
        int n = length(list);
        List<ObjectNode> out = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            JsonNode node = node(item(list, i));
            if (!(node instanceof ObjectNode object)) {
                throw new IllegalArgumentException("Event " + (i + 1) + " is not a JSON object.");
            }
            out.add(object);
        }
        return out;
    }

    /** Un arbre Jackson en valeur JavaScript, membres dans leur ordre. */
    static JSObject value(JsonNode node) {
        switch (node.getNodeType()) {
            case OBJECT: {
                JSObject out = newObject();
                Iterator<String> names = node.fieldNames();
                while (names.hasNext()) {
                    String name = names.next();
                    set(out, name, value(node.get(name)));
                }
                return out;
            }
            case ARRAY: {
                JSObject out = newArray();
                for (JsonNode child : node) {
                    push(out, value(child));
                }
                return out;
            }
            case STRING:
                return ofString(node.textValue());
            case NUMBER:
                return ofNumber(node.doubleValue());
            case BOOLEAN:
                return ofBoolean(node.booleanValue());
            default:
                return null;
        }
    }

    static JSObject values(List<? extends JsonNode> nodes) {
        JSObject out = newArray();
        for (JsonNode node : nodes) {
            push(out, value(node));
        }
        return out;
    }

    @JSBody(params = "o", script = "return Object.keys(o);")
    private static native String[] keys(JSObject o);

    @JSBody(params = { "o", "k" }, script = "var v = o[k]; return v === undefined || v === null ? null : String(v);")
    private static native String string(JSObject o, String k);

    @JSBody(params = { "o", "k" }, script = "return o[k] | 0;")
    private static native int integer(JSObject o, String k);

    @JSBody(params = { "o", "k" }, script = "return o[k];")
    static native JSObject member(JSObject o, String k);

    @JSBody(params = "o", script = "return o.length;")
    private static native int length(JSObject o);

    @JSBody(params = { "o", "i" }, script = "return o[i];")
    static native JSObject item(JSObject o, int i);

    @JSBody(params = "v", script = "return v !== null && typeof v === 'object';")
    private static native boolean isObject(JSObject v);

    @JSBody(params = "v", script = "if (v === null || v === undefined) return 'null';"
        + " if (Array.isArray(v)) return 'array';"
        + " if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';"
        + " return typeof v;")
    private static native String kind(JSObject v);

    @JSBody(params = "v", script = "return v;")
    private static native boolean bool(JSObject v);

    @JSBody(params = "v", script = "return v;")
    private static native double number(JSObject v);

    @JSBody(params = "v", script = "return v;")
    private static native String text(JSObject v);

    @JSBody(script = "return {};")
    private static native JSObject newObject();

    @JSBody(script = "return [];")
    private static native JSObject newArray();

    @JSBody(params = { "o", "k", "v" }, script = "o[k] = v;")
    private static native void set(JSObject o, String k, JSObject v);

    @JSBody(params = { "a", "v" }, script = "a.push(v);")
    private static native void push(JSObject a, JSObject v);

    @JSBody(params = "s", script = "return s;")
    private static native JSObject ofString(String s);

    @JSBody(params = "n", script = "return n;")
    private static native JSObject ofNumber(double n);

    @JSBody(params = "b", script = "return b;")
    private static native JSObject ofBoolean(boolean b);
}
