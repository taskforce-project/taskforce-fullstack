package com.taskforce.rules_engine_js;

import java.util.List;

import org.teavm.jso.JSBody;
import org.teavm.jso.JSExport;
import org.teavm.jso.JSObject;

import com.taskforce.tf_api.core.harness.evidence.CanonicalJson;
import com.taskforce.tf_api.core.harness.evidence.EvidenceChain;
import com.taskforce.tf_api.core.harness.rules.Glob;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.harness.rules.RulesDigest;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;

/**
 * Le moteur de règles du serveur, exposé au runner en JavaScript : chaque fonction exportée lit les valeurs
 * JavaScript du runner ({@link JsValues}), appelle le moteur de backend/tf-api et rend sa réponse en valeurs
 * JavaScript. Les décisions, les motifs, l'empreinte d'un paquet et la chaîne du dossier de preuve sont ceux du
 * serveur, compilés depuis ses sources ; les déclarations TypeScript sont dans src/main/typescript/rules-engine.d.ts.
 * Une erreur du moteur arrive au runner comme une {@code Error} JavaScript, avec son message.
 */
public final class RulesEngineJs {

    private RulesEngineJs() {
    }

    public static void main(String[] args) {
        // Rien : le module n'expose que ses fonctions.
    }

    /** La décision d'un jeu de faits : {@code {effect, rule}}, {@code rule} étant la règle du paquet reçu, ou null. */
    @JSExport
    public static JSObject decide(JSObject bundle, JSObject facts) {
        try {
            RulesBundle rules = JsValues.bundle(bundle);
            return answer(bundle, rules, RulesEngine.decide(rules, JsValues.facts(facts)));
        } catch (RuntimeException e) {
            throw error(e);
        }
    }

    /** La décision d'un appel d'outil décrit par plusieurs jeux de faits : la plus stricte l'emporte. */
    @JSExport
    public static JSObject decideAll(JSObject bundle, JSObject factsList) {
        try {
            RulesBundle rules = JsValues.bundle(bundle);
            return answer(bundle, rules, RulesEngine.decideAll(rules, JsValues.factsList(factsList)));
        } catch (RuntimeException e) {
            throw error(e);
        }
    }

    @JSExport
    public static boolean globMatch(String pattern, String value) {
        try {
            return Glob.matches(pattern, value);
        } catch (RuntimeException e) {
            throw error(e);
        }
    }

    /** L'empreinte d'un paquet (contracts/README.md, règle 6), sans son champ {@code digest} ni ses membres nuls. */
    @JSExport
    public static String bundleDigest(JSObject bundle) {
        try {
            return RulesDigest.of(JsValues.node(bundle));
        } catch (RuntimeException e) {
            throw error(e);
        }
    }

    /** Le JSON canonique d'une valeur (contracts/README.md, preuve, règle 4) ; un nombre décimal est refusé. */
    @JSExport
    public static String canonicalJson(JSObject value) {
        try {
            return CanonicalJson.of(JsValues.node(value));
        } catch (RuntimeException e) {
            throw error(e);
        }
    }

    /** Les événements chaînés, chacun avec {@code prev} et {@code hash}, depuis l'empreinte nulle. */
    @JSExport
    public static JSObject chain(JSObject events) {
        try {
            return JsValues.values(EvidenceChain.chain(JsValues.objects(events)));
        } catch (RuntimeException e) {
            throw error(e);
        }
    }

    /** L'indice du premier événement dont l'empreinte ne tient pas, ou -1 si toute la chaîne tient. */
    @JSExport
    public static int firstBrokenLink(JSObject events) {
        try {
            return EvidenceChain.firstBrokenLink(JsValues.objects(events));
        } catch (RuntimeException e) {
            throw error(e);
        }
    }

    /** L'empreinte qui précède le premier événement : {@code sha256:} suivi de 64 zéros. */
    @JSExport
    public static String zeroHash() {
        return EvidenceChain.ZERO_HASH;
    }

    /** La règle gagnante est rendue telle que le runner l'a donnée : le même objet, à la même place du paquet. */
    private static JSObject answer(JSObject bundle, RulesBundle rules, RulesEngine.Decision decision) {
        JSObject rule = null;
        if (decision.rule() != null) {
            List<RulesBundle.Rule> list = rules.rules();
            for (int i = 0; i < list.size(); i++) {
                if (list.get(i) == decision.rule()) {
                    rule = JsValues.item(JsValues.member(bundle, "rules"), i);
                    break;
                }
            }
        }
        return decision(decision.effect(), rule);
    }

    private static RuntimeException error(RuntimeException e) {
        raise(e.getMessage() != null ? e.getMessage() : "The rules engine could not answer.");
        return e;
    }

    @JSBody(params = { "effect", "rule" }, script = "return { effect: effect, rule: rule };")
    private static native JSObject decision(String effect, JSObject rule);

    @JSBody(params = "message", script = "throw new Error(message);")
    private static native void raise(String message);
}
