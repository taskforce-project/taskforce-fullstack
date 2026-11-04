package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * La suite fixe des cas de capacité (R113, séance n°16) : peu de cas, écrits ici avec leur résultat attendu avant tout
 * rejeu, et versionnés. Chaque cas se rejoue comme un cas de la banque ({@link AgentService#replay}) : le prompt et les
 * outils de Cortex, une lecture servie par la cassette, une écriture proposée et jamais faite. La note vient du code :
 * l'outil et ses arguments ({@link EvalGrader}), puis ce que la réponse doit dire, ou ne pas dire.
 *
 * <p>Changer un cas, c'est changer de version : les mesures d'une autre version ne comptent plus dans la table.</p>
 */
public final class CapabilitySuite {

    /** La version de la suite ; une mesure n'est lue qu'avec les cas de sa version. */
    public static final int VERSION = 1;

    /** La date que le modèle lit dans le prompt : fixe, pour que deux mesures posent la même question. */
    static final LocalDate ASKED_ON = LocalDate.of(2026, 11, 4);

    /** Les deux tailles de document du contexte, en mots : le court tient dans 4 096 jetons avec le prompt de Cortex. */
    static final int SHORT_DOCUMENT = 500;
    static final int LONG_DOCUMENT = 3000;

    static final String CODE_NAME = "HERON-7";

    private CapabilitySuite() {
    }

    /** Ce que la réponse doit dire ({@code present}), ou ne pas dire, vérifié par un motif. */
    public record Expect(String label, Pattern pattern, boolean present) {
        static Expect says(String label, String regex) {
            return new Expect(label, Pattern.compile(regex, Pattern.CASE_INSENSITIVE), true);
        }

        static Expect doesNotSay(String label, String regex) {
            return new Expect(label, Pattern.compile(regex, Pattern.CASE_INSENSITIVE), false);
        }
    }

    /**
     * Un cas : sa clé, la capacité qu'il mesure, ce qu'il vérifie en une phrase, ce que le modèle reçoit, les critères de
     * l'outil ({@code null} s'il ne porte pas sur un outil), ce que la réponse doit dire, et pour le contexte la taille du
     * document en mots (0 sinon).
     */
    public record CapabilityCase(String key, Capability capability, String title, ReplayCase replay,
                                 EvalCriteria criteria, List<Expect> expect, int documentWords) {
        public CapabilityCase {
            expect = expect == null ? List.of() : List.copyOf(expect);
        }
    }

    // Les morceaux du journal du contexte, avant les cas qui le construisent (ordre d'initialisation).
    private static final String[] TEAMS = {"design", "support", "billing", "mobile", "platform", "data", "sales", "security"};
    private static final String[] ACTS = {"reviewed", "shortened", "tested", "rewrote", "planned", "measured", "documented",
        "split"};
    private static final String[] THINGS = {"the onboarding steps", "the invoice screen", "the search filters",
        "the export to CSV", "the sign-in page", "the weekly report", "the release checklist", "the error messages"};
    private static final String[] OUTCOMES = {"and kept the current order", "and asked for one more week",
        "and found two small bugs", "and agreed to ship it as is", "and moved it to the next cycle",
        "and wrote down the open questions"};

    private static final String CODE_QUESTION = "This is the log of the Atlas project. What is the release code name in "
        + "this log? Answer with the code name only.";

    private static final List<CapabilityCase> CASES = List.of(
        new CapabilityCase("tools-move", Capability.TOOLS,
            "Moves ATLAS-3 to Done with update_issue",
            ask("Move ATLAS-3 to Done."),
            tool("update_issue", "issue", "ATLAS-3", "status", "Done"), List.of(), 0),
        new CapabilityCase("tools-list", Capability.TOOLS,
            "Lists the issues of the Atlas project with list_issues",
            ask("Which issues of the Atlas project are blocked?"),
            tool("list_issues", "project", "Atlas|ATLAS"), List.of(), 0),
        new CapabilityCase("context-short", Capability.CONTEXT,
            "Finds the code name at the start of a " + SHORT_DOCUMENT + "-word log",
            ask(document(SHORT_DOCUMENT) + "\n\n" + CODE_QUESTION), null,
            List.of(Expect.says("says " + CODE_NAME, Pattern.quote(CODE_NAME))), SHORT_DOCUMENT),
        new CapabilityCase("context-long", Capability.CONTEXT,
            "Finds the code name at the start of a " + LONG_DOCUMENT + "-word log",
            ask(document(LONG_DOCUMENT) + "\n\n" + CODE_QUESTION), null,
            List.of(Expect.says("says " + CODE_NAME, Pattern.quote(CODE_NAME))), LONG_DOCUMENT),
        new CapabilityCase("code-js-sort", Capability.CODE,
            "Says that [10, 9, 1].sort() prints 1,10,9 in JavaScript",
            ask("What does this JavaScript print? Answer with the printed value only.\n\n```js\n"
                + "console.log([10, 9, 1].sort().join(\",\"))\n```"), null,
            List.of(Expect.says("says 1,10,9", "1\\s*,\\s*10\\s*,\\s*9")), 0),
        new CapabilityCase("code-python-default", Capability.CODE,
            "Says that a shared default list makes Python print 1 2 3",
            ask("What does this Python print? Answer with the printed line only.\n\n```python\n"
                + "def add(item, items=[]):\n    items.append(item)\n    return len(items)\n\n"
                + "print(add(\"a\"), add(\"b\"), add(\"c\"))\n```"), null,
            List.of(Expect.says("says 1 2 3", "(?<![\\d,])1\\s+2\\s+3(?![\\d,])")), 0),
        new CapabilityCase("french-read", Capability.FRENCH,
            "Answers a question in French, in French, from the minutes it is given",
            ask("Voici le compte rendu de la réunion d'hier : « La version 2 sortira le 14 mars. Claire s'occupe de la "
                + "documentation, et Marc des tests. » Qui s'occupe des tests, et quand sort la version 2 ?"), null,
            List.of(Expect.says("says Marc", "\\bMarc\\b"), Expect.says("says 14 mars", "\\b14\\s+mars\\b"),
                Expect.doesNotSay("does not answer in English (March)", "\\bMarch\\b")), 0),
        new CapabilityCase("english-read", Capability.ENGLISH,
            "Answers a question in English, in English, from the notes it is given",
            ask("Here are yesterday's meeting notes: \"Version 2 ships on March 14. Claire owns the documentation and Marc "
                + "owns the tests.\" Who owns the tests, and when does version 2 ship?"), null,
            List.of(Expect.says("says Marc", "\\bMarc\\b"),
                Expect.says("says March 14", "\\bMarch\\s+14|\\b14(th)?\\s+(of\\s+)?March\\b"),
                Expect.doesNotSay("does not answer in French (mars)", "\\bmars\\b")), 0));

    /** Les cas de la suite, dans l'ordre de la table. */
    public static List<CapabilityCase> cases() {
        return CASES;
    }

    public static Optional<CapabilityCase> find(String key) {
        return CASES.stream().filter(c -> c.key().equals(key)).findFirst();
    }

    /** Le nombre de cas d'une capacité. */
    public static int count(Capability capability) {
        return (int) CASES.stream().filter(c -> c.capability() == capability).count();
    }

    /** Note un rejeu : chaque critère de l'outil, puis chaque phrase attendue ou interdite ; le cas passe si tout passe. */
    public static EvalGrader.Grade grade(CapabilityCase capabilityCase, ReplayOutcome outcome) {
        List<EvalGrader.Check> checks = new ArrayList<>();
        if (capabilityCase.criteria() != null) {
            checks.addAll(EvalGrader.grade(capabilityCase.criteria(), outcome).checks());
        }
        String answer = outcome.answer() == null ? "" : outcome.answer();
        for (Expect expect : capabilityCase.expect()) {
            boolean found = expect.pattern().matcher(answer).find();
            checks.add(new EvalGrader.Check(expect.label(), found == expect.present(), excerpt(answer)));
        }
        boolean passed = !checks.isEmpty() && checks.stream().allMatch(EvalGrader.Check::passed);
        return new EvalGrader.Grade(passed, List.copyOf(checks));
    }

    // -------------------------------------------------------------------------

    private static ReplayCase ask(String question) {
        return new ReplayCase(question, ASKED_ON, List.of(), List.of());
    }

    /** L'outil attendu et ses arguments, dans l'ordre : un nom, puis ses valeurs acceptées séparées par « | ». */
    private static EvalCriteria tool(String name, String... pairs) {
        Map<String, List<String>> args = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            args.put(pairs[i], List.of(pairs[i + 1].split("\\|")));
        }
        return new EvalCriteria(name, args, null, null, null, null, false);
    }

    /**
     * Un journal de projet d'au moins {@code words} mots, toujours le même : le nom de code est dans sa première entrée,
     * la question vient après la dernière. Un modèle qui ne tient pas tout perd soit le début, soit la question.
     */
    static String document(int words) {
        StringBuilder log = new StringBuilder("Atlas project log.\n");
        log.append("Entry 1. The release code name is ").append(CODE_NAME)
            .append(": the support team chose it, and nobody may change it.\n");
        int count = wordCount(log);
        for (int i = 2; count < words; i++) {
            String entry = "Entry " + i + ". The " + TEAMS[i % TEAMS.length] + " team " + ACTS[(i * 3) % ACTS.length] + " "
                + THINGS[(i * 5) % THINGS.length] + " " + OUTCOMES[(i * 7) % OUTCOMES.length] + ".\n";
            log.append(entry);
            count += wordCount(entry);
        }
        return log.toString().stripTrailing();
    }

    static int wordCount(CharSequence text) {
        String flat = text.toString().strip();
        return flat.isEmpty() ? 0 : flat.split("\\s+").length;
    }

    private static String excerpt(String answer) {
        String flat = answer.replace('\n', ' ').strip();
        return flat.length() <= 200 ? flat : flat.substring(0, 200) + "...";
    }
}
