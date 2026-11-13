package com.taskforce.tf_api.core.service.rules;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import com.taskforce.tf_api.core.harness.rules.RulesEngine;

/**
 * La validation d'une règle de l'entreprise, sans modèle (R157, R98) : ce qu'une règle traduite des mots de la personne
 * doit tenir pour entrer. Le format du contrat (taskforce-rules/1), puis le socle : une couche de l'entreprise ne fait
 * que durcir (elle demande ou refuse, jamais n'autorise), ne touche pas aux règles elles-mêmes, et ne pose de condition
 * que sur un fait que TaskForce produit vraiment pour cette action (R15 : une règle qui ne s'appliquerait jamais ne
 * s'enregistre pas). Chaque refus a un code, que l'écran dit en mots.
 */
public final class RuleValidator {

    /** Une raison de refus : son code, et ce qu'il nomme (l'action, la condition, la personne). */
    public record Problem(String code, String detail) {
        static Problem of(String code) {
            return new Problem(code, null);
        }
    }

    /**
     * Les actions que TaskForce produit, et les faits qu'il produit pour chacune : une condition sur un autre fait ne
     * tiendrait jamais. {@code actor} vaut pour toutes ; un seuil ne porte que sur l'argument chiffré d'un outil de
     * l'entreprise.
     */
    static final Map<String, Set<String>> FACTS = Map.ofEntries(
        Map.entry("file.read", Set.of("tool", "path")),
        Map.entry("file.search", Set.of("tool", "path")),
        Map.entry("file.write", Set.of("tool", "path")),
        Map.entry("shell", Set.of("tool", "command")),
        Map.entry("git.commit", Set.of("tool", "command")),
        Map.entry("git.push", Set.of("branch", "repoVisibility")),
        Map.entry("pr.open", Set.of("branch", "repoVisibility")),
        Map.entry("mission.start", Set.of("repoVisibility")),
        Map.entry("issue.read", Set.of("tool")),
        Map.entry("issue.create", Set.of("tool")),
        Map.entry("issue.update", Set.of("tool")),
        Map.entry("issue.delete", Set.of("tool")),
        Map.entry("comment.create", Set.of("tool")),
        Map.entry("project.create", Set.of("tool")),
        Map.entry("knowledge.search", Set.of("tool")),
        Map.entry("knowledge.create", Set.of("tool")),
        Map.entry("web.search", Set.of("tool")),
        Map.entry("web.fetch", Set.of("tool")),
        Map.entry("mcp.read", Set.of("tool", "server", "over")),
        Map.entry("mcp.write", Set.of("tool", "server", "over")));

    static final Set<String> CONDITIONS = Set.of("action", "tool", "command", "path", "branch", "repoVisibility",
        "server", "sensitivity", "actor", "over");
    static final Set<String> GLOBS = Set.of("tool", "command", "path", "branch", "server");
    static final Pattern APPROVER = Pattern.compile("^(person:[0-9]{1,19}|role:(owner|admin)|project-lead)$");
    static final Pattern FACT = Pattern.compile("^arg\\.[A-Za-z0-9_]{1,40}$");
    static final int MAX_PATTERN = 200;
    static final int MAX_APPROVERS = 10;

    private RuleValidator() {
    }

    /**
     * Ce qui empêche une règle d'entrer dans une couche de l'entreprise, vide quand elle peut entrer.
     *
     * @param rule    la règle traduite : {@code when}, {@code effect}, et pour une règle qui demande {@code require}
     * @param members les personnes de l'espace qui peuvent être désignées, par id
     */
    public static List<Problem> check(Map<String, Object> rule, Set<Long> members) {
        List<Problem> problems = new ArrayList<>();
        Object effect = rule.get("effect");
        if (RulesEngine.ALLOW.equals(effect)) {
            problems.add(Problem.of("loosens"));
        } else if (!RulesEngine.ASK.equals(effect) && !RulesEngine.DENY.equals(effect)) {
            problems.add(Problem.of("noEffect"));
        }
        Map<String, Object> when = map(rule.get("when"));
        if (when == null || when.isEmpty()) {
            problems.add(Problem.of("noCondition"));
            return problems;
        }
        for (String key : when.keySet()) {
            if (!CONDITIONS.contains(key)) {
                problems.add(new Problem("unknownCondition", key));
            }
        }
        // Une règle de l'entreprise nomme toujours son action : sans elle, elle couvrirait aussi celles que TaskForce garde.
        Object action = when.get("action");
        if (action == null) {
            problems.add(Problem.of("noAction"));
        } else if (RulesEngine.HARNESS_CHANGE.equals(action)) {
            problems.add(Problem.of("rulesAreTaskForce"));
        } else if (!(action instanceof String a && FACTS.containsKey(a))) {
            problems.add(new Problem("unknownAction", String.valueOf(action)));
        }
        if (when.containsKey("sensitivity")) {
            problems.add(new Problem("neverApplies", "sensitivity"));
        }
        for (String key : GLOBS) {
            Object value = when.get(key);
            if (value != null && !(value instanceof String s && !s.isBlank() && s.length() <= MAX_PATTERN)) {
                problems.add(new Problem("badPattern", key));
            }
        }
        Object visibility = when.get("repoVisibility");
        if (visibility != null && !"public".equals(visibility) && !"private".equals(visibility)) {
            problems.add(new Problem("badPattern", "repoVisibility"));
        }
        Object actor = when.get("actor");
        if (actor != null && !"agent".equals(actor) && !"person".equals(actor)) {
            problems.add(new Problem("badPattern", "actor"));
        }
        checkThreshold(when.get("over"), problems);
        if (problems.isEmpty()) {
            checkProduced(when, problems);
        }
        checkRequire(rule.get("require"), effect, members, problems);
        return problems;
    }

    private static void checkThreshold(Object over, List<Problem> problems) {
        if (over == null) {
            return;
        }
        Map<String, Object> threshold = map(over);
        if (threshold == null || !(threshold.get("fact") instanceof String fact) || !FACT.matcher(fact).matches()
                || !(threshold.get("value") instanceof Number value) || value.doubleValue() != Math.rint(value.doubleValue())) {
            problems.add(new Problem("badPattern", "over"));
        }
    }

    /** Chaque condition porte sur un fait que TaskForce produit pour l'action que la règle nomme. */
    private static void checkProduced(Map<String, Object> when, List<Problem> problems) {
        Set<String> produced = FACTS.get((String) when.get("action"));
        for (String key : when.keySet()) {
            if (!"action".equals(key) && !"actor".equals(key) && !produced.contains(key)) {
                problems.add(new Problem("neverApplies", key));
            }
        }
    }

    private static void checkRequire(Object require, Object effect, Set<Long> members, List<Problem> problems) {
        if (require == null) {
            return;
        }
        Map<String, Object> r = map(require);
        if (r == null) {
            problems.add(new Problem("badPattern", "require"));
            return;
        }
        if (!RulesEngine.ASK.equals(effect)) {
            problems.add(Problem.of("requireOnlyWhenAsking"));
        }
        for (String key : r.keySet()) {
            if (!Set.of("approvers", "signatures", "separate").contains(key)) {
                problems.add(new Problem("badPattern", "require." + key));
            }
        }
        Object approvers = r.get("approvers");
        if (approvers != null) {
            if (!(approvers instanceof List<?> list) || list.isEmpty() || list.size() > MAX_APPROVERS) {
                problems.add(new Problem("badPattern", "approvers"));
            } else {
                for (Object item : list) {
                    String ref = item == null ? "" : item.toString();
                    if (!APPROVER.matcher(ref).matches()) {
                        problems.add(new Problem("badApprover", ref));
                    } else if (ref.startsWith("person:") && !members.contains(Long.valueOf(ref.substring(7)))) {
                        problems.add(new Problem("notAMember", ref));
                    }
                }
            }
        }
        Object signatures = r.get("signatures");
        if (signatures != null && !(signatures instanceof Number n && n.intValue() >= 1 && n.intValue() <= 3
                && n.doubleValue() == n.intValue())) {
            problems.add(new Problem("badPattern", "signatures"));
        }
        Object separate = r.get("separate");
        if (separate != null && !(separate instanceof Boolean)) {
            problems.add(new Problem("badPattern", "separate"));
        }
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> map(Object value) {
        if (value instanceof Map<?, ?> m) {
            Map<String, Object> out = new LinkedHashMap<>();
            ((Map<Object, Object>) m).forEach((k, v) -> out.put(String.valueOf(k), v));
            return out;
        }
        return null;
    }
}
