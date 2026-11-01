package com.taskforce.e16;

import org.teavm.jso.JSExport;
import org.teavm.jso.JSObject;

import com.taskforce.tf_api.core.harness.rules.Glob;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.harness.rules.RulesDigest;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;

/**
 * Expérience E16, voie (b) : le moteur Java du backend (RulesEngine, Glob, RulesDigest, compilés depuis backend/tf-api
 * sans copie) exposé au runner en JavaScript par TeaVM : décisions et empreinte (rules-engine.js).
 */
public final class RulesEngineJs {

    private static RulesBundle bundle;

    private RulesEngineJs() {
    }

    public static void main(String[] args) {
        // Rien : le module n'expose que ses fonctions.
    }

    /** Le paquet de règles des décisions suivantes (l'objet JavaScript tel que le serveur l'envoie). */
    @JSExport
    public static void load(JSObject rules) {
        bundle = JsBridge.toBundle(rules);
    }

    @JSExport
    public static boolean globMatches(String pattern, String value) {
        return Glob.matches(pattern, value);
    }

    /** Une décision pour un jeu de faits : {@code {effect, rule}}. */
    @JSExport
    public static JSObject decide(JSObject facts) {
        return JsBridge.answer(RulesEngine.decide(bundle, JsBridge.toFacts(facts)));
    }

    /** La décision d'un appel d'outil (plusieurs jeux de faits, le plus strict l'emporte). */
    @JSExport
    public static JSObject decideAll(JSObject factsList) {
        return JsBridge.answer(RulesEngine.decideAll(bundle, JsBridge.toFactsList(factsList)));
    }

    /** L'empreinte d'un paquet (contracts/README.md, règle 6), calculée par RulesDigest. */
    @JSExport
    public static String digest(JSObject rules) {
        return RulesDigest.of(JsBridge.toNode(rules));
    }
}
