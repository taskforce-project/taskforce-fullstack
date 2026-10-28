package com.taskforce.tf_api.core.harness.rules;

import java.util.Map;
import java.util.function.Function;

import com.taskforce.tf_api.core.harness.rules.RulesBundle.Condition;
import com.taskforce.tf_api.core.harness.rules.RulesBundle.Rule;

/**
 * Décision d'une action à partir d'un paquet de règles (contracts/README.md). Code déterministe, sans réseau ni
 * horloge ni modèle : mêmes règles et mêmes faits, même décision (invariant 1 de la spécification de la v2). Refuser
 * l'emporte sur demander, qui l'emporte sur autoriser ; à effet égal, la première règle du paquet ; aucune règle :
 * l'action est inconnue, donc demandée.
 */
public final class RulesEngine {

    public static final String ALLOW = "allow";
    public static final String ASK = "ask";
    public static final String DENY = "deny";

    /** La règle qui l'emporte ; {@code rule} est nul quand aucune règle ne s'applique. */
    public record Decision(String effect, Rule rule) {
    }

    private record Field(String name, Function<Condition, String> read, boolean equality) {
    }

    private static final Field[] FIELDS = {
        new Field("action", Condition::action, true),
        new Field("tool", Condition::tool, false),
        new Field("command", Condition::command, false),
        new Field("path", Condition::path, false),
        new Field("branch", Condition::branch, false),
        new Field("repoVisibility", Condition::repoVisibility, true),
        new Field("server", Condition::server, false),
        new Field("sensitivity", Condition::sensitivity, true),
    };

    private RulesEngine() {
    }

    /** @param facts ce qu'on sait de l'action, par nom de condition ; un fait absent ne satisfait jamais une condition. */
    public static Decision decide(RulesBundle bundle, Map<String, String> facts) {
        Rule winner = null;
        for (Rule rule : bundle.rules()) {
            if (matches(rule.when(), facts) && (winner == null || rank(rule.effect()) > rank(winner.effect()))) {
                winner = rule;
            }
        }
        return winner == null ? new Decision(ASK, null) : new Decision(winner.effect(), winner);
    }

    static boolean matches(Condition when, Map<String, String> facts) {
        for (Field field : FIELDS) {
            String expected = field.read().apply(when);
            if (expected == null) {
                continue;
            }
            String actual = facts.get(field.name());
            if (actual == null) {
                return false;
            }
            boolean ok = field.equality() ? actual.equals(expected) : Glob.matches(expected, actual);
            if (!ok) {
                return false;
            }
        }
        return true;
    }

    private static int rank(String effect) {
        return switch (effect) {
            case DENY -> 3;
            case ASK -> 2;
            case ALLOW -> 1;
            default -> throw new IllegalArgumentException("Unknown rule effect: " + effect);
        };
    }
}
