package com.taskforce.tf_api.core.harness.rules;

import java.util.List;
import java.util.Map;
import java.util.Set;

import com.taskforce.tf_api.core.harness.rules.RulesBundle.Rule;
import com.taskforce.tf_api.core.harness.rules.RulesEngine.Decision;

/**
 * Le socle (R157, séance n°22) : ce que TaskForce garantit dans son code, quelles que soient les règles du paquet. Il
 * se juge dans le moteur, après la table et toutes les couches de l'entreprise, et ne fait que durcir la décision.
 *
 * <ol>
 *   <li>Aucun secret ne sort : une action qui en porte un est refusée, quel que soit son auteur.</li>
 *   <li>Aucun agent ne change les règles.</li>
 *   <li>Une action irréversible d'un agent ne part jamais sans une personne (R1) : la classe de l'action selon TaskForce
 *   ({@link #classOf}), et celle que déclare la règle qui l'autorise, sont appliquées (R98) ; une sortie réversible sans
 *   action inverse ne l'est pas.</li>
 *   <li>Jamais les trois à la fois sans une personne (R158) : après un contenu non fiable, avec des données sensibles,
 *   une écriture ou une communication au-dehors est demandée.</li>
 * </ol>
 *
 * <p>Les faits qu'il lit : {@code actor} ({@code agent} ou {@code person} ; absent, c'est un agent), {@code secret},
 * {@code untrusted} et {@code sensitive} ({@code "true"} quand ils tiennent). Ceux qui jugent une action les produisent :
 * le runner pour Claude Code, le serveur pour Cortex et pour les gestes d'une personne.</p>
 */
public final class RulesFloor {

    public static final String OWNER = "TaskForce";
    private static final String REVIEW = "2027-01-31";

    public static final String READ = "read";
    public static final String SANDBOX_WRITE = "sandbox-write";
    public static final String REVERSIBLE_EXIT = "reversible-exit";
    public static final String IRREVERSIBLE = "irreversible";

    public static final Rule NO_SECRET = rule("floor-no-secret", RulesEngine.DENY,
        "A secret never leaves TaskForce: this action carries one, so it doesn't run.");
    public static final Rule NO_AGENT_RULES = rule("floor-no-agent-rules", RulesEngine.DENY,
        "No agent changes the rules: only a person who may change them does.");
    public static final Rule IRREVERSIBLE_NEEDS_PERSON = rule("floor-irreversible", RulesEngine.ASK,
        "An action that can't be undone never runs without a person's decision.");
    public static final Rule THREE_AT_ONCE = rule("floor-three-at-once", RulesEngine.ASK,
        "This would act outside after reading content from outside, with your company's data at hand: a person decides.");

    /** Les règles du socle, dans l'ordre où le moteur les juge. */
    public static final List<Rule> RULES = List.of(NO_SECRET, NO_AGENT_RULES, IRREVERSIBLE_NEEDS_PERSON, THREE_AT_ONCE);

    private static final Set<String> READS = Set.of("file.read", "file.search", "issue.read", "knowledge.search", "mcp.read");
    private static final Set<String> SANDBOX = Set.of("file.write", "git.commit", "mission.start");
    private static final Set<String> REVERSIBLE = Set.of("issue.create", "issue.update", "comment.create",
        "project.create", "knowledge.create");
    private static final Set<String> ONE_WAY = Set.of("web.search", "web.fetch", "mcp.write", "issue.delete",
        "harness.change");

    private RulesFloor() {
    }

    /**
     * La classe d'une action selon TaskForce, d'après ses seuls faits ; nulle quand ils ne suffisent pas (une commande :
     * les règles en décident). Pousser n'est réversible que sur la branche de l'agent d'un dépôt privé, une pull request
     * que sur un dépôt privé ; ailleurs, ou sans savoir, c'est une porte qui ne se referme pas.
     */
    public static String classOf(Map<String, String> facts) {
        String action = facts.get("action");
        if (action == null) {
            return null;
        }
        if (READS.contains(action)) {
            return READ;
        }
        if (SANDBOX.contains(action)) {
            return SANDBOX_WRITE;
        }
        if (REVERSIBLE.contains(action)) {
            return REVERSIBLE_EXIT;
        }
        if (ONE_WAY.contains(action)) {
            return IRREVERSIBLE;
        }
        boolean isPrivate = "private".equals(facts.get("repoVisibility"));
        if ("git.push".equals(action)) {
            String branch = facts.get("branch");
            return isPrivate && branch != null && Glob.matches("tf/**", branch) ? REVERSIBLE_EXIT : IRREVERSIBLE;
        }
        if ("pr.open".equals(action)) {
            return isPrivate ? REVERSIBLE_EXIT : IRREVERSIBLE;
        }
        return null;
    }

    /**
     * La décision des règles, durcie par le socle. Le socle ne relâche jamais : il ne rend que plus strict ou pareil, et
     * une décision qui refuse déjà garde la règle qui l'a prise.
     */
    static Decision apply(Decision decision, Map<String, String> facts) {
        if (RulesEngine.DENY.equals(decision.effect())) {
            return decision;
        }
        if (isTrue(facts.get("secret"))) {
            return new Decision(RulesEngine.DENY, NO_SECRET);
        }
        boolean person = "person".equals(facts.get("actor"));
        if (!person && "harness.change".equals(facts.get("action"))) {
            return new Decision(RulesEngine.DENY, NO_AGENT_RULES);
        }
        if (person || !RulesEngine.ALLOW.equals(decision.effect())) {
            return decision;
        }
        Rule rule = decision.rule();
        String actionClass = classOf(facts);
        if (IRREVERSIBLE.equals(actionClass) || (rule != null && !reversible(rule))) {
            return new Decision(RulesEngine.ASK, IRREVERSIBLE_NEEDS_PERSON);
        }
        if (isTrue(facts.get("untrusted")) && isTrue(facts.get("sensitive")) && goesOut(actionClass, rule)) {
            return new Decision(RulesEngine.ASK, THREE_AT_ONCE);
        }
        return decision;
    }

    /** La classe que déclare une règle qui autorise : irréversible, ou une sortie sans action qui la défait, ne l'est pas. */
    private static boolean reversible(Rule rule) {
        String declared = rule.actionClass();
        if (IRREVERSIBLE.equals(declared)) {
            return false;
        }
        return !REVERSIBLE_EXIT.equals(declared) || (rule.inverse() != null && !rule.inverse().isBlank());
    }

    /**
     * Une écriture ou une communication hors de la copie de l'agent : une sortie, réversible ou non. Pour une action dont
     * TaskForce ne connaît pas la classe par ses faits (une commande), celle de la règle qui l'autorise : une lecture ou
     * une écriture dans la copie reste dedans ; sans règle, c'est une sortie.
     */
    private static boolean goesOut(String actionClass, Rule rule) {
        if (actionClass != null) {
            return REVERSIBLE_EXIT.equals(actionClass) || IRREVERSIBLE.equals(actionClass);
        }
        if (rule == null) {
            return true;
        }
        return !READ.equals(rule.actionClass()) && !SANDBOX_WRITE.equals(rule.actionClass());
    }

    private static boolean isTrue(String fact) {
        return "true".equals(fact);
    }

    private static Rule rule(String id, String effect, String reason) {
        return new Rule(id, null, IRREVERSIBLE, effect, null, OWNER, reason, REVIEW);
    }
}
