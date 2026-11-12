package com.taskforce.tf_api.core.harness.rules;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import com.taskforce.tf_api.core.harness.rules.RulesBundle.Condition;
import com.taskforce.tf_api.core.harness.rules.RulesBundle.Rule;

/**
 * Décision d'une action à partir d'un paquet de règles (contracts/README.md). Code déterministe, sans réseau ni
 * horloge ni modèle : mêmes règles et mêmes faits, même décision (invariant 1 de la spécification de la v2).
 *
 * <ol>
 *   <li>La table de TaskForce (les règles sans couche) : refuser l'emporte sur demander, qui l'emporte sur autoriser ; à
 *   effet égal, la première règle du paquet ; aucune règle : l'action est inconnue, donc demandée.</li>
 *   <li>Les couches de l'entreprise (R157) ne font que durcir : une de leurs règles qui demande ou refuse l'emporte si
 *   elle est plus stricte, et à effet égal, la première du paquet (le serveur y range les couches de la plus précise à
 *   la plus large, avant la table) ; une de leurs règles qui autorise ne compte jamais. Elles ne décident jamais de
 *   {@code harness.change}, l'action que TaskForce garde : seule sa table en décide.</li>
 *   <li>Quand la décision est de demander, les obligations de toutes les règles qui demandent s'ajoutent : chaque liste
 *   de personnes désignées, le plus grand nombre de signatures, la séparation de qui prépare et de qui signe (R98).</li>
 *   <li>Le socle ({@link RulesFloor}) passe en dernier, après toutes les couches, et aucune ne le relâche.</li>
 * </ol>
 */
public final class RulesEngine {

    public static final String ALLOW = "allow";
    public static final String ASK = "ask";
    public static final String DENY = "deny";

    /** L'action que TaskForce garde, changer les règles : seule sa table en décide, jamais une couche de l'entreprise. */
    public static final String HARNESS_CHANGE = "harness.change";

    /**
     * La règle qui l'emporte ; {@code rule} est nul quand aucune règle ne s'applique. {@code require} n'existe que pour
     * une décision de demander dont une règle désigne qui accorde, plusieurs signatures ou la séparation des rôles.
     */
    public record Decision(String effect, Rule rule, Obligations require) {

        public Decision(String effect, Rule rule) {
            this(effect, rule, null);
        }
    }

    /**
     * Ce qu'un accord doit réunir : chaque liste de {@code approvers} (une par règle qui en désigne) compte au moins une
     * personne qui accorde ; {@code signatures} personnes distinctes accordent ; avec {@code separate}, la personne qui a
     * préparé l'action n'en est pas.
     */
    public record Obligations(List<List<String>> approvers, int signatures, boolean separate) {

        public boolean addsNothing() {
            return approvers.isEmpty() && signatures <= 1 && !separate;
        }
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
        new Field("actor", Condition::actor, true),
    };

    private RulesEngine() {
    }

    /** @param facts ce qu'on sait de l'action, par nom de condition ; un fait absent ne satisfait jamais une condition. */
    public static Decision decide(RulesBundle bundle, Map<String, String> facts) {
        boolean ours = HARNESS_CHANGE.equals(facts.get("action"));
        Rule winner = null;
        for (Rule rule : bundle.rules()) {
            if ((ours && rule.layer() != null) || !matches(rule.when(), facts)) {
                continue; // changer les règles : seule la table de TaskForce en décide, jamais une couche de l'entreprise
            }
            int rank = rank(rule.effect());
            if (rule.layer() != null && rank == rank(ALLOW)) {
                continue; // une couche de l'entreprise ne relâche rien : son « autoriser » ne compte pas
            }
            if (winner == null || rank > rank(winner.effect())) {
                winner = rule;
            }
        }
        String effect = winner == null ? ASK : winner.effect();
        Obligations require = ASK.equals(effect) ? obligations(bundle, facts) : null;
        return RulesFloor.apply(new Decision(effect, winner, require), facts);
    }

    /**
     * Plusieurs faits pour un seul appel (une commande composée, une action qu'on ne sait pas borner) : le plus strict
     * l'emporte, et à effet égal le premier ; les obligations des décisions qui demandent s'ajoutent. Aucun fait (un outil
     * interne de l'agent, sans effet hors de la session) : autorisé, sans règle. C'est ainsi que le runner juge chaque
     * appel d'outil de Claude Code.
     */
    public static Decision decideAll(RulesBundle bundle, List<Map<String, String>> factsList) {
        Decision strictest = null;
        List<Obligations> asked = new ArrayList<>();
        for (Map<String, String> facts : factsList) {
            Decision decision = decide(bundle, facts);
            if (strictest == null || rank(decision.effect()) > rank(strictest.effect())) {
                strictest = decision;
            }
            if (decision.require() != null) {
                asked.add(decision.require());
            }
        }
        if (strictest == null) {
            return new Decision(ALLOW, null);
        }
        if (!ASK.equals(strictest.effect()) || asked.isEmpty()) {
            return strictest;
        }
        return new Decision(strictest.effect(), strictest.rule(), merge(asked));
    }

    /** Les obligations des règles qui demandent et couvrent ces faits, réunies ; nulles s'il n'y en a aucune. */
    private static Obligations obligations(RulesBundle bundle, Map<String, String> facts) {
        boolean ours = HARNESS_CHANGE.equals(facts.get("action"));
        List<Obligations> asked = new ArrayList<>();
        for (Rule rule : bundle.rules()) {
            if (ours && rule.layer() != null) {
                continue;
            }
            if (rule.require() != null && ASK.equals(rule.effect()) && matches(rule.when(), facts)) {
                RulesBundle.Require r = rule.require();
                List<List<String>> approvers = r.approvers() == null || r.approvers().isEmpty()
                    ? List.of() : List.of(List.copyOf(r.approvers()));
                int signatures = r.signatures() == null ? 1 : Math.max(1, r.signatures());
                asked.add(new Obligations(approvers, signatures, Boolean.TRUE.equals(r.separate())));
            }
        }
        if (asked.isEmpty()) {
            return null;
        }
        Obligations merged = merge(asked);
        return merged.addsNothing() ? null : merged;
    }

    private static Obligations merge(List<Obligations> all) {
        List<List<String>> approvers = new ArrayList<>();
        int signatures = 1;
        boolean separate = false;
        for (Obligations o : all) {
            for (List<String> set : o.approvers()) {
                if (!approvers.contains(set)) {
                    approvers.add(set);
                }
            }
            signatures = Math.max(signatures, o.signatures());
            separate = separate || o.separate();
        }
        return new Obligations(List.copyOf(approvers), signatures, separate);
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
        return when.over() == null || above(facts.get(when.over().fact()), when.over().value());
    }

    /**
     * Un fait chiffré au-delà du seuil : un nombre écrit en chiffres (signe, point décimal) plus grand que le seuil. Le
     * seuil se lit après les autres conditions de la règle : quand elles tiennent et que le fait manque ou n'est pas un
     * nombre, le seuil compte comme dépassé.
     */
    static boolean above(String fact, long threshold) {
        if (fact == null || !isNumber(fact)) {
            return true;
        }
        return new BigDecimal(fact).compareTo(BigDecimal.valueOf(threshold)) > 0;
    }

    private static boolean isNumber(String text) {
        int i = text.startsWith("-") ? 1 : 0;
        boolean digits = false;
        boolean point = false;
        for (; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c >= '0' && c <= '9') {
                digits = true;
            } else if (c == '.' && !point && digits) {
                point = true;
                digits = false;
            } else {
                return false;
            }
        }
        return digits && text.length() <= 40;
    }

    static int rank(String effect) {
        return switch (effect) {
            case DENY -> 3;
            case ASK -> 2;
            case ALLOW -> 1;
            default -> throw new IllegalArgumentException("Unknown rule effect: " + effect);
        };
    }
}
