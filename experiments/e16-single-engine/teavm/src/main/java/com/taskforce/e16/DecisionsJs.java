package com.taskforce.e16;

import org.teavm.jso.JSExport;
import org.teavm.jso.JSObject;

import com.taskforce.tf_api.core.harness.rules.Glob;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;

/**
 * Expérience E16, voie (b) : les décisions seules (RulesEngine, Glob), sans l'empreinte (decisions.js). Elles se
 * compilent sans rien ajouter à TeaVM ; l'empreinte, elle, demande des classes du JDK que TeaVM n'a pas.
 */
public final class DecisionsJs {

    private static RulesBundle bundle;

    private DecisionsJs() {
    }

    public static void main(String[] args) {
        // Rien : le module n'expose que ses fonctions.
    }

    @JSExport
    public static void load(JSObject rules) {
        bundle = JsBridge.toBundle(rules);
    }

    @JSExport
    public static boolean globMatches(String pattern, String value) {
        return Glob.matches(pattern, value);
    }

    @JSExport
    public static JSObject decide(JSObject facts) {
        return JsBridge.answer(RulesEngine.decide(bundle, JsBridge.toFacts(facts)));
    }

    @JSExport
    public static JSObject decideAll(JSObject factsList) {
        return JsBridge.answer(RulesEngine.decideAll(bundle, JsBridge.toFactsList(factsList)));
    }
}
