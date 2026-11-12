package com.taskforce.tf_api.core.service.rules;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import com.taskforce.tf_api.core.harness.rules.Glob;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;

/**
 * Les cas d'une règle (R98) : des actions décrites par leurs faits, avec ce que la règle doit en décider. TaskForce en
 * écrit deux pour chaque règle, sans modèle : une action que la règle couvre (elle doit demander ou refuser comme elle le
 * dit, avec ses personnes désignées), et une action juste à côté (la décision sans elle), quand il en existe une. Les cas
 * que le modèle a écrits avec la traduction s'y ajoutent. Tous se rejouent à chaque changement des règles de l'espace :
 * une règle qui ne passe pas ses cas n'entre pas.
 */
public final class RuleCases {

    /** Qui a écrit le cas : TaskForce, d'après la règle, ou le modèle, d'après la phrase de la personne. */
    public static final String BY_TASKFORCE = "taskforce";
    public static final String BY_MODEL = "model";

    private RuleCases() {
    }

    /** Ce qu'un cas attend : l'effet, et pour une demande, la liste de personnes désignées qu'elle doit porter. */
    public record Expect(String effect, List<String> approvers) {
    }

    /** Un cas : sa description en mots quand le modèle l'a écrite, ses faits, ce qu'il attend, qui l'a écrit. */
    public record Case(String text, Map<String, String> facts, Expect expect, String source) {
    }

    /** Ce que le moteur a décidé d'un cas, et si c'est ce qu'il attendait. */
    public record Outcome(Case c, RulesEngine.Decision decision, boolean passed) {
    }

    /** Les deux cas que TaskForce écrit pour une règle, d'après ses seules conditions ; aucun s'il n'en trouve pas. */
    public static List<Case> generated(Map<String, Object> rule, RulesBundle without) {
        List<Case> cases = new ArrayList<>();
        Map<String, String> covered = covered(rule);
        if (covered == null) {
            return cases;
        }
        cases.add(new Case(null, covered, new Expect(String.valueOf(rule.get("effect")), approvers(rule)), BY_TASKFORCE));
        Map<String, String> beside = beside(rule, covered);
        if (beside != null) {
            RulesEngine.Decision outside = RulesEngine.decide(without, beside);
            cases.add(new Case(null, beside, new Expect(outside.effect(), null), BY_TASKFORCE));
        }
        return cases;
    }

    /** Rejoue un cas contre un paquet. */
    public static Outcome run(Case c, RulesBundle bundle) {
        RulesEngine.Decision decision = RulesEngine.decide(bundle, c.facts());
        return new Outcome(c, decision, holds(c.expect(), decision));
    }

    static boolean holds(Expect expect, RulesEngine.Decision decision) {
        if (!expect.effect().equals(decision.effect())) {
            return false;
        }
        if (expect.approvers() == null || expect.approvers().isEmpty()) {
            return true;
        }
        if (decision.require() == null) {
            return false;
        }
        Set<String> wanted = new HashSet<>(expect.approvers());
        return decision.require().approvers().stream().anyMatch(set -> new HashSet<>(set).equals(wanted));
    }

    @SuppressWarnings("unchecked")
    static List<String> approvers(Map<String, Object> rule) {
        Map<String, Object> require = RuleValidator.map(rule.get("require"));
        if (require == null || !(require.get("approvers") instanceof List<?> list) || list.isEmpty()) {
            return null;
        }
        return ((List<Object>) list).stream().map(String::valueOf).toList();
    }

    /** Une action que la règle couvre : chaque condition remplie par un exemple ; l'acteur, un agent par défaut. */
    static Map<String, String> covered(Map<String, Object> rule) {
        Map<String, Object> when = RuleValidator.map(rule.get("when"));
        if (when == null || when.isEmpty()) {
            return null;
        }
        Map<String, String> facts = new LinkedHashMap<>();
        Object action = when.get("action");
        facts.put("action", action != null ? action.toString() : firstActionFor(when));
        if (facts.get("action") == null) {
            return null;
        }
        for (Map.Entry<String, Object> e : when.entrySet()) {
            String key = e.getKey();
            if ("action".equals(key) || e.getValue() == null) {
                continue;
            }
            if ("over".equals(key)) {
                Map<String, Object> over = RuleValidator.map(e.getValue());
                if (over == null || !(over.get("value") instanceof Number value)) {
                    return null;
                }
                facts.put(String.valueOf(over.get("fact")), BigInteger.valueOf(value.longValue()).add(BigInteger.ONE).toString());
            } else if (RuleValidator.GLOBS.contains(key)) {
                String example = example(e.getValue().toString(), "path".equals(key));
                if (example == null) {
                    return null;
                }
                facts.put(key, example);
            } else {
                facts.put(key, e.getValue().toString());
            }
        }
        facts.putIfAbsent("actor", "agent");
        return facts;
    }

    /**
     * Une action juste à côté : la même, avec la condition la plus parlante qui ne tient plus (le chemin, la commande, la
     * branche, l'outil, le seuil) ; null quand la règle n'en a pas ou que le motif couvre tout.
     */
    static Map<String, String> beside(Map<String, Object> rule, Map<String, String> covered) {
        Map<String, Object> when = RuleValidator.map(rule.get("when"));
        Map<String, String> other = new LinkedHashMap<>(covered);
        if (when.get("path") instanceof String path) {
            return differs(other, "path", path, "docs/notes.md");
        }
        if (when.get("command") instanceof String command) {
            return differs(other, "command", command, "git status");
        }
        if (when.get("branch") instanceof String branch) {
            return differs(other, "branch", branch, "tf/other-work");
        }
        if (when.get("server") instanceof String server) {
            return differs(other, "server", server, "another-tool");
        }
        if (when.get("over") != null) {
            Map<String, Object> over = RuleValidator.map(when.get("over"));
            other.put(String.valueOf(over.get("fact")), String.valueOf(((Number) over.get("value")).longValue()));
            return other;
        }
        return null;
    }

    private static Map<String, String> differs(Map<String, String> facts, String key, String pattern, String value) {
        if (Glob.matches(pattern, value)) {
            return null;
        }
        facts.put(key, value);
        return facts;
    }

    /** La première action (dans l'ordre du contrat) pour laquelle TaskForce produit tous les faits que la règle demande. */
    private static String firstActionFor(Map<String, Object> when) {
        Set<String> needed = new TreeSet<>(when.keySet());
        needed.remove("actor");
        for (String action : new TreeSet<>(RuleValidator.FACTS.keySet())) {
            if (RuleValidator.FACTS.get(action).containsAll(needed)) {
                return action;
            }
        }
        return null;
    }

    /**
     * Une valeur que le motif couvre : chaque {@code **} et {@code *} remplacé par un mot, chaque {@code {a,b}} par sa
     * première possibilité. Dans un chemin, un {@code **} avant une barre devient un dossier, sinon un fichier. Null si
     * l'exemple ne tient pas (le motif se vérifie après coup, par le même moteur).
     */
    static String example(String pattern, boolean path) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < pattern.length(); i++) {
            char c = pattern.charAt(i);
            if (c == '{') {
                int end = pattern.indexOf('}', i);
                if (end < 0) {
                    out.append(c);
                    continue;
                }
                String first = example(pattern.substring(i + 1, end).split(",", -1)[0], path);
                if (first == null) {
                    return null;
                }
                out.append(first);
                i = end;
            } else if (c == '*') {
                boolean two = i + 1 < pattern.length() && pattern.charAt(i + 1) == '*';
                if (two) {
                    i++;
                }
                char next = i + 1 < pattern.length() ? pattern.charAt(i + 1) : 0;
                out.append(!path ? "example" : next == '/' ? "src" : next == '.' ? "example" : "example.ts");
            } else {
                out.append(c);
            }
        }
        String value = out.toString();
        return Glob.matches(pattern, value) ? value : null;
    }
}
