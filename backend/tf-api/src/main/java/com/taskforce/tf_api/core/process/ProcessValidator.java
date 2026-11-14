package com.taskforce.tf_api.core.process;

import static com.taskforce.tf_api.core.process.ProcessModel.AGENT;
import static com.taskforce.tf_api.core.process.ProcessModel.APPROVAL;
import static com.taskforce.tf_api.core.process.ProcessModel.APPROVED;
import static com.taskforce.tf_api.core.process.ProcessModel.BEFORE_APPLY;
import static com.taskforce.tf_api.core.process.ProcessModel.BEFORE_DELIVERY;
import static com.taskforce.tf_api.core.process.ProcessModel.BEFORE_MISSION;
import static com.taskforce.tf_api.core.process.ProcessModel.CHECKLIST;
import static com.taskforce.tf_api.core.process.ProcessModel.DEADLINE;
import static com.taskforce.tf_api.core.process.ProcessModel.DECISION;
import static com.taskforce.tf_api.core.process.ProcessModel.END;
import static com.taskforce.tf_api.core.process.ProcessModel.FAILED;
import static com.taskforce.tf_api.core.process.ProcessModel.FAILURE;
import static com.taskforce.tf_api.core.process.ProcessModel.HUMAN;
import static com.taskforce.tf_api.core.process.ProcessModel.INPUT;
import static com.taskforce.tf_api.core.process.ProcessModel.LOCK_PAUSE_POINT;
import static com.taskforce.tf_api.core.process.ProcessModel.MESSAGE;
import static com.taskforce.tf_api.core.process.ProcessModel.PARALLEL;
import static com.taskforce.tf_api.core.process.ProcessModel.REFUSED;
import static com.taskforce.tf_api.core.process.ProcessModel.STAGE;
import static com.taskforce.tf_api.core.process.ProcessModel.START;
import static com.taskforce.tf_api.core.process.ProcessModel.SUCCEEDED;
import static com.taskforce.tf_api.core.process.ProcessModel.TIMER;
import static com.taskforce.tf_api.core.process.ProcessModel.WAIT;
import static com.taskforce.tf_api.core.process.ProcessModel.ZONE;

import java.time.Duration;
import java.time.Period;
import java.time.format.DateTimeParseException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

import com.taskforce.tf_api.core.process.ProcessModel.Condition;
import com.taskforce.tf_api.core.process.ProcessModel.Field;
import com.taskforce.tf_api.core.process.ProcessModel.Flow;
import com.taskforce.tf_api.core.process.ProcessModel.HumanTask;
import com.taskforce.tf_api.core.process.ProcessModel.Lock;
import com.taskforce.tf_api.core.process.ProcessModel.RuleRef;
import com.taskforce.tf_api.core.process.ProcessModel.Step;
import com.taskforce.tf_api.core.process.ProcessModel.WaitFor;

/**
 * Le vérificateur des processus (ADR-027, point 6) : un seul, en code, pur, pour tout ce qui entre (l'import, le
 * brouillon de l'IA, l'éditeur, la publication). Il vérifie le sous-ensemble, qu'aucune étape ne reste sans personne
 * qui en réponde, que chaque étape d'agent soit dans sa zone et sous ses règles, que les étapes verrouillées et les
 * points de pause soient là, que chaque décision ait sa condition jugée par du code, que chaque attente dise ce qu'elle
 * attend, et que toute étape mène à une fin. Ses refus sont des phrases, chacune avec son code et l'étape qu'elle vise ;
 * un processus passe quand il n'y en a aucun.
 *
 * <p>Aucune dépendance : ni base, ni Spring, ni modèle de langage. Ce que le vérificateur doit savoir de l'endroit où le
 * processus entre (la version qu'il remplace, les workflows par défaut, les règles et les personnes de l'espace) lui
 * vient du {@link Context}.</p>
 */
public final class ProcessValidator {

    /** Le plus grand processus qu'on vérifie : au-delà, il se découpe. */
    public static final int MAX_STEPS = 300;
    public static final int MAX_FLOWS = 600;
    static final int MAX_NAME = 200;
    static final int MAX_TEXT = 2000;
    static final int MAX_LINE = 300;
    /** Une liste de contrôle a moins de dix lignes (Gawande, séance n°25). */
    public static final int MAX_CHECKLIST = 9;
    /** Une étape d'agent se tente trois fois au plus, puis l'incident (ADR-023). */
    public static final int MAX_ATTEMPTS = 3;

    static final Pattern KEY = Pattern.compile("^[a-z][a-z0-9-]{0,79}$");
    static final Pattern ID = Pattern.compile("^[A-Za-z][A-Za-z0-9_-]{0,79}$");
    /** Qui répond, qui fait, qui fournit : comme ceux qui accordent une règle (RuleValidator.APPROVER). */
    static final Pattern PERSON = Pattern.compile("^(person:[0-9]{1,19}|role:(owner|admin)|project-lead)$");
    static final Pattern RULE = Pattern.compile("^[a-z0-9][a-z0-9-]{1,79}$");
    static final Pattern PROVIDER = Pattern.compile("^[a-z][a-z0-9-]{1,39}$");
    static final Pattern TOOL = Pattern.compile("^[a-z0-9][a-z0-9._-]{0,79}$");
    static final Pattern ISSUE = Pattern.compile("^[A-Za-z][A-Za-z0-9]{0,19}-[0-9]{1,9}$");

    /** Les refus qui rendent la forme du processus trop incertaine pour les vérifications de bout en bout. */
    private static final Set<String> STRUCTURAL = Set.of("tooLarge", "badId", "duplicateId", "unknownType", "flowUnknown",
        "flowAcross", "startCount", "endMissing", "notInSubset");

    private ProcessValidator() {
    }

    /** Un refus : son code, l'étape qu'il vise (son identifiant et son nom, ou null), et sa phrase. */
    public record Problem(String code, String stepId, String step, String message) {
    }

    /** Ce qu'un fichier importé contenait hors du sous-ensemble : l'élément, l'étape où il était, son nom. */
    public record Foreign(String element, String stepId, String name) {
    }

    /**
     * Ce que la vérification sait de l'endroit où le processus entre ; tout est facultatif.
     *
     * @param bases      les versions dont les étapes verrouillées doivent rester (la version en vigueur)
     * @param defaults   les workflows par défaut, par clé : celui d'où le processus dérive est aussi une base
     * @param knownRules les règles que l'espace connaît pour ce travail ; null : non vérifié
     * @param members    les personnes de l'espace ; null : non vérifié
     */
    public record Context(List<ProcessModel> bases, Map<String, ProcessModel> defaults, Set<String> knownRules,
                          Set<Long> members) {

        public static final Context NONE = new Context(List.of(), Map.of(), null, null);

        public Context {
            bases = bases == null ? List.of() : List.copyOf(bases);
            defaults = defaults == null ? Map.of() : Map.copyOf(defaults);
        }
    }

    public static List<Problem> check(ProcessModel model, Context context) {
        return check(model, context, List.of());
    }

    public static List<Problem> check(ProcessModel model, Context context, List<Foreign> foreign) {
        return new Run(model, context == null ? Context.NONE : context).check(foreign == null ? List.of() : foreign);
    }

    // ------------------------------------------------------------------------------------------------- une vérification

    private static final class Run {

        private final ProcessModel model;
        private final Context context;
        private final List<Problem> problems = new ArrayList<>();
        /** Chaque étape par son identifiant (le premier gagne quand un identifiant se répète). */
        private final Map<String, Step> byId = new LinkedHashMap<>();
        /** Le conteneur de chaque étape : son étape de haut niveau ou sa zone, ou null au niveau du processus. */
        private final Map<String, Step> parentOf = new HashMap<>();

        Run(ProcessModel model, Context context) {
            this.model = model;
            this.context = context;
        }

        List<Problem> check(List<Foreign> foreign) {
            for (Foreign f : foreign) {
                add("notInSubset", f.stepId(), f.name(), ProcessSubset.reason(f.element(), f.name() != null ? f.name()
                    : f.stepId()));
            }
            // Un fichier qui sort du sous-ensemble se reprend d'abord là : le reste de ses refus en découlerait.
            if (!foreign.isEmpty()) {
                return problems;
            }
            if (model.format() != null && !ProcessModel.FORMAT.equals(model.format())) {
                add("format", null, null, "This process is written in a format TaskForce doesn't read: " + model.format()
                    + ".");
            }
            if (model.key() == null || !KEY.matcher(model.key()).matches()) {
                add("badKey", null, null, "A process needs a key: lowercase letters, digits and dashes, starting with a "
                    + "letter, 80 at most.");
            }
            if (model.name() == null) {
                add("noName", null, null, "The process needs a name.");
            } else {
                length(null, model.name(), MAX_NAME, "The name of the process");
            }
            length(null, model.description(), MAX_TEXT, "The description of the process");
            List<Step> all = model.allSteps();
            int flowCount = model.flowsOrEmpty().size() + all.stream().mapToInt(s -> s.flowsOrEmpty().size()).sum();
            if (all.size() > MAX_STEPS || flowCount > MAX_FLOWS) {
                add("tooLarge", null, null, "This process has more than " + MAX_STEPS + " steps or " + MAX_FLOWS
                    + " paths: split it into several processes.");
                return problems;
            }
            identifiers(all);
            index(null, model.stepsOrEmpty());
            container(null, model.stepsOrEmpty(), model.flowsOrEmpty());
            for (Step step : all) {
                settings(step);
            }
            boolean sound = problems.stream().noneMatch(p -> STRUCTURAL.contains(p.code()));
            if (sound) {
                Graph graph = Graph.of(model);
                conditions(graph);
                pausePoints(graph);
            }
            locked();
            return problems;
        }

        // --------------------------------------------------------------------------------------------- forme

        private void identifiers(List<Step> all) {
            Set<String> seen = new HashSet<>();
            List<Flow> flows = new ArrayList<>(model.flowsOrEmpty());
            all.forEach(s -> flows.addAll(s.flowsOrEmpty()));
            for (Step step : all) {
                if (step.id() == null || !ID.matcher(step.id()).matches()) {
                    add("badId", step.id(), step.name(), "“" + step.label() + "” needs an identifier: letters, digits, "
                        + "dashes and underscores, starting with a letter, 80 at most.");
                } else if (!seen.add(step.id())) {
                    add("duplicateId", step.id(), step.name(), "Two parts of the process have the same identifier: "
                        + step.id() + ".");
                }
                if (step.type() == null || !ProcessModel.TYPES.contains(step.type())) {
                    add("unknownType", step.id(), step.name(), "“" + step.label() + "” is of a kind TaskForce's processes "
                        + "don't have: " + Objects.toString(step.type(), "none") + ".");
                }
                // Une étape, ou une étape de haut niveau, se lit par son nom ; un début, une fin ou un partage peut s'en passer.
                if (step.name() == null && (step.workStep() || STAGE.equals(step.type()))) {
                    add("noName", step.id(), null, "The step " + Objects.toString(step.id(), "") + " needs a name.");
                }
            }
            for (Flow flow : flows) {
                if (flow.id() == null || !ID.matcher(flow.id()).matches()) {
                    add("badId", flow.id(), null, "A path needs an identifier: letters, digits, dashes and underscores, "
                        + "starting with a letter, 80 at most.");
                } else if (!seen.add(flow.id())) {
                    add("duplicateId", flow.id(), null, "Two parts of the process have the same identifier: " + flow.id()
                        + ".");
                }
            }
        }

        private void index(Step parent, List<Step> steps) {
            for (Step step : steps) {
                if (step.id() != null) {
                    byId.putIfAbsent(step.id(), step);
                    parentOf.putIfAbsent(step.id(), parent);
                }
                index(step, step.stepsOrEmpty());
            }
        }

        /** Un conteneur : le processus (parent nul) ou une étape de haut niveau. Une zone se vérifie à part. */
        private void container(Step parent, List<Step> steps, List<Flow> flows) {
            String where = parent == null ? "The process" : "The stage “" + parent.label() + "”";
            long starts = steps.stream().filter(s -> START.equals(s.type())).count();
            if (starts != 1) {
                add("startCount", parent == null ? null : parent.id(), parent == null ? null : parent.name(),
                    where + " needs exactly one start.");
            }
            if (steps.stream().noneMatch(s -> END.equals(s.type()))) {
                add("endMissing", parent == null ? null : parent.id(), parent == null ? null : parent.name(),
                    where + " has no end.");
            }
            for (Step step : steps) {
                placement(parent, step);
                if (STAGE.equals(step.type())) {
                    container(step, step.stepsOrEmpty(), step.flowsOrEmpty());
                } else if (ZONE.equals(step.type())) {
                    zone(step);
                } else if (!step.stepsOrEmpty().isEmpty() || !step.flowsOrEmpty().isEmpty()) {
                    add("notAContainer", step.id(), step.name(), "“" + step.label() + "” holds other steps, which only a "
                        + "stage or an agent zone does.");
                }
            }
            paths(parent, steps, flows);
        }

        private void placement(Step parent, Step step) {
            if (step.type() == null) {
                return;
            }
            if (parent == null && List.of(HUMAN, WAIT, ZONE).contains(step.type())) {
                add("stepOutsideStage", step.id(), step.name(), "“" + step.label() + "” isn't in a stage: put it in one "
                    + "of the process's stages.");
            }
            if (AGENT.equals(step.type())) {
                add("agentOutsideZone", step.id(), step.name(), "“" + step.label() + "” is an agent step outside an "
                    + "agent zone: put it in a zone, so that what the agent may do is bounded by rules.");
            }
            if (parent != null && STAGE.equals(step.type())) {
                add("stageInStage", step.id(), step.name(), "“" + step.label() + "” is a stage inside the stage “"
                    + parent.label() + "”: a stage holds steps, not other stages.");
            }
            if (parent != null && END.equals(step.type()) && Boolean.TRUE.equals(step.terminate())) {
                add("terminateInStage", step.id(), step.name(), "“" + step.label() + "” stops everything from inside "
                    + "the stage “" + parent.label() + "”: stopping the whole process is done at its top level.");
            }
        }

        private void zone(Step zone) {
            if (zone.stepsOrEmpty().isEmpty()) {
                add("zoneEmpty", zone.id(), zone.name(), "The agent zone “" + zone.label() + "” has no agent step: say "
                    + "what the agent may do in it.");
            }
            for (Step inner : zone.stepsOrEmpty()) {
                if (!AGENT.equals(inner.type())) {
                    add("zoneContent", inner.id(), inner.name(), "The agent zone “" + zone.label() + "” holds agent steps "
                        + "only: move “" + inner.label() + "” out of it.");
                }
            }
            if (!zone.flowsOrEmpty().isEmpty()) {
                add("zoneFlows", zone.id(), zone.name(), "The agent zone “" + zone.label() + "” has paths inside: the "
                    + "agent chooses the order of its steps, so the zone has none.");
            }
        }

        // --------------------------------------------------------------------------------------------- chemins

        private void paths(Step parent, List<Step> steps, List<Flow> flows) {
            Map<String, Step> local = new LinkedHashMap<>();
            steps.forEach(s -> { if (s.id() != null) local.putIfAbsent(s.id(), s); });
            Map<String, List<Flow>> out = new HashMap<>();
            Map<String, List<Flow>> in = new HashMap<>();
            boolean linked = true;
            for (Flow flow : flows) {
                boolean ends = true;
                for (String end : new String[] {flow.from(), flow.to()}) {
                    if (end == null || !local.containsKey(end)) {
                        ends = false;
                        if (end != null && byId.containsKey(end)) {
                            add("flowAcross", flow.id(), null, "A path joins two steps side by side: the path from “"
                                + label(flow.from()) + "” to “" + label(flow.to()) + "” goes into or out of a stage or "
                                + "an agent zone.");
                        } else {
                            add("flowUnknown", flow.id(), null, "The path " + Objects.toString(flow.id(), "")
                                + " leads to a step that isn't there: " + Objects.toString(end, "none") + ".");
                        }
                        break;
                    }
                }
                if (!ends) {
                    linked = false;
                    continue;
                }
                out.computeIfAbsent(flow.from(), k -> new ArrayList<>()).add(flow);
                in.computeIfAbsent(flow.to(), k -> new ArrayList<>()).add(flow);
            }
            for (Step step : local.values()) {
                List<Flow> outs = out.getOrDefault(step.id(), List.of());
                List<Flow> ins = in.getOrDefault(step.id(), List.of());
                shape(step, ins, outs);
            }
            for (Step step : local.values()) {
                if (step.boundary()) {
                    boundary(parent, step, local);
                }
            }
            if (linked && local.values().stream().filter(s -> START.equals(s.type())).count() == 1) {
                reach(local, out);
            }
        }

        private void shape(Step step, List<Flow> ins, List<Flow> outs) {
            String type = Objects.toString(step.type(), "");
            for (Flow flow : outs) {
                if (!DECISION.equals(type) && (flow.condition() != null || flow.otherwiseFlow())) {
                    add("conditionOutsideDecision", flow.id(), null, "Only a decision chooses a path: the path from “"
                        + step.label() + "” can't have a condition.");
                }
            }
            switch (type) {
                case START -> {
                    if (!ins.isEmpty()) {
                        add("startIncoming", step.id(), step.name(), "Nothing leads back into the start “" + step.label()
                            + "”.");
                    }
                }
                case END -> {
                    if (!outs.isEmpty()) {
                        add("endOutgoing", step.id(), step.name(), "Nothing goes on after the end “" + step.label()
                            + "”.");
                    }
                }
                case DEADLINE, FAILURE -> {
                    if (!ins.isEmpty()) {
                        add("boundaryIncoming", step.id(), step.name(), "Nothing leads into “" + step.label() + "”: it "
                            + "starts from the step it watches.");
                    }
                }
                case DECISION -> decision(step, ins, outs);
                case PARALLEL -> {
                    boolean split = ins.size() == 1 && outs.size() >= 2;
                    boolean join = ins.size() >= 2 && outs.size() == 1;
                    if (!split && !join) {
                        add("gatewayShape", step.id(), step.name(), "“" + step.label() + "” either splits one path into "
                            + "several that run in parallel, or joins several into one.");
                    }
                }
                default -> { }
            }
            if (!DECISION.equals(type) && !PARALLEL.equals(type) && outs.size() > 1) {
                add("severalPaths", step.id(), step.name(), "“" + step.label() + "” has several paths out: split them "
                    + "with a decision, or with paths in parallel.");
            }
        }

        private void decision(Step step, List<Flow> ins, List<Flow> outs) {
            if (outs.size() < 2) {
                add("gatewayShape", step.id(), step.name(), "The decision “" + step.label() + "” needs two paths out at "
                    + "least.");
                return;
            }
            long defaults = outs.stream().filter(Flow::otherwiseFlow).count();
            if (defaults == 0) {
                add("decisionWithoutDefault", step.id(), step.name(), "The decision “" + step.label() + "” has no path "
                    + "for every other case: mark one of its paths “Otherwise”.");
            } else if (defaults > 1) {
                add("severalDefaults", step.id(), step.name(), "The decision “" + step.label() + "” has " + defaults
                    + " paths for every other case: keep one.");
            }
            for (Flow flow : outs) {
                Condition condition = flow.condition();
                if (flow.otherwiseFlow()) {
                    if (condition != null) {
                        add("otherwiseWithCondition", step.id(), step.name(), "The path of “" + step.label() + "” for "
                            + "every other case has no condition of its own.");
                    }
                    continue;
                }
                if (condition == null || condition.wordsOnly()) {
                    add("decisionWithoutCondition", step.id(), step.name(), "The decision “" + step.label() + "” takes "
                        + "the path to “" + label(flow.to()) + "” " + (condition == null || condition.text() == null
                        ? "with no condition" : "on words alone (“" + condition.text() + "”)") + ": TaskForce judges a "
                        + "condition with code, never with a model. Say which step it depends on, and which result.");
                } else if (condition.text() == null) {
                    add("conditionWords", step.id(), step.name(), "The decision “" + step.label() + "” takes the path to “"
                        + label(flow.to()) + "” on a condition with no words: say it in a sentence too.");
                } else {
                    length(step, condition.text(), MAX_LINE, "A condition");
                }
            }
        }

        private void boundary(Step parent, Step step, Map<String, Step> local) {
            Step host = step.attachedTo() == null ? null : local.get(step.attachedTo());
            Set<String> hosts = DEADLINE.equals(step.type()) ? Set.of(HUMAN, ZONE, STAGE) : Set.of(ZONE, STAGE);
            if (host == null || !hosts.contains(host.type())) {
                add("boundaryTarget", step.id(), step.name(), DEADLINE.equals(step.type())
                    ? "The deadline “" + step.label() + "” must watch a human task, an agent zone or a stage of the same "
                        + (parent == null ? "process" : "stage") + "."
                    : "The failure path “" + step.label() + "” must start from an agent zone or a stage of the same "
                        + (parent == null ? "process" : "stage") + ".");
            }
            if (DEADLINE.equals(step.type())) {
                duration(step, step.duration(), true);
            }
        }

        /**
         * Toute étape se rejoint depuis le début, et toute étape mène à une fin, dans son conteneur. Une échéance ou un
         * chemin d'échec se rejoint quand son étape se rejoint ; il ne compte pas pour dire que son étape mène à une fin.
         */
        private void reach(Map<String, Step> local, Map<String, List<Flow>> out) {
            Map<String, Set<String>> forward = new HashMap<>();
            Map<String, Set<String>> backward = new HashMap<>();
            for (Map.Entry<String, List<Flow>> e : out.entrySet()) {
                for (Flow f : e.getValue()) {
                    forward.computeIfAbsent(f.from(), k -> new LinkedHashSet<>()).add(f.to());
                    backward.computeIfAbsent(f.to(), k -> new LinkedHashSet<>()).add(f.from());
                }
            }
            Map<String, Set<String>> withBoundaries = new HashMap<>();
            forward.forEach((k, v) -> withBoundaries.put(k, new LinkedHashSet<>(v)));
            for (Step s : local.values()) {
                if (s.boundary() && s.attachedTo() != null && local.containsKey(s.attachedTo())) {
                    withBoundaries.computeIfAbsent(s.attachedTo(), k -> new LinkedHashSet<>()).add(s.id());
                }
            }
            String start = local.values().stream().filter(s -> START.equals(s.type())).findFirst().map(Step::id)
                .orElseThrow();
            Set<String> reached = walk(Set.of(start), withBoundaries);
            Set<String> ends = new LinkedHashSet<>();
            local.values().stream().filter(s -> END.equals(s.type())).forEach(s -> ends.add(s.id()));
            Set<String> leading = walk(ends, backward);
            for (Step s : local.values()) {
                if (!reached.contains(s.id())) {
                    add("unreachable", s.id(), s.name(), "“" + s.label() + "” can never be reached from the start.");
                } else if (!ends.isEmpty() && !leading.contains(s.id())) {
                    // Sans aucune fin, le refus endMissing le dit déjà, une fois.
                    add("noEnd", s.id(), s.name(), "“" + s.label() + "” doesn't lead to an end: every step must lead to "
                        + "one.");
                }
            }
        }

        // --------------------------------------------------------------------------------------------- réglages

        private void settings(Step step) {
            if (step.type() == null) {
                return;
            }
            length(step, step.name(), MAX_NAME, "The name of “" + step.label() + "”");
            length(step, step.description(), MAX_TEXT, "The description of “" + step.label() + "”");
            if (step.workStep()) {
                if (step.answeredBy() == null) {
                    add("noOwner", step.id(), step.name(), "“" + step.label() + "” has no one who answers for it: name a "
                        + "person or a role.");
                } else {
                    person(step, step.answeredBy());
                }
            }
            if (step.rules() != null) {
                for (RuleRef rule : step.rules()) {
                    rule(step, rule);
                }
            }
            if (step.documents() != null) {
                step.documents().forEach(d -> length(step, d, MAX_LINE, "A document “" + step.label() + "” expects"));
            }
            if (step.issue() != null && !ISSUE.matcher(step.issue()).matches()) {
                add("badIssue", step.id(), step.name(), "“" + step.label() + "” carries an issue by its key, like WEB-12: "
                    + step.issue() + " isn't one.");
            }
            if (step.lock() != null) {
                lock(step, step.lock());
            }
            switch (step.type()) {
                case AGENT -> agent(step);
                case HUMAN -> human(step, step.human());
                case WAIT -> waitFor(step, step.waitFor());
                default -> { }
            }
        }

        private void agent(Step step) {
            if (step.agent() == null || step.agent().provider() == null
                || !PROVIDER.matcher(step.agent().provider()).matches()) {
                add("agentShape", step.id(), step.name(), "“" + step.label() + "” doesn't say which agent does it.");
            } else {
                Integer attempts = step.agent().attempts();
                if (attempts != null && (attempts < 1 || attempts > MAX_ATTEMPTS)) {
                    add("agentShape", step.id(), step.name(), "“" + step.label() + "” is tried " + MAX_ATTEMPTS
                        + " times at most, then a person looks at it.");
                }
                duration(step, step.agent().timeout(), false);
                if (step.agent().tools() != null) {
                    for (String tool : step.agent().tools()) {
                        if (!TOOL.matcher(tool).matches()) {
                            add("agentShape", step.id(), step.name(), "“" + step.label() + "” names a tool TaskForce "
                                + "doesn't know: " + tool + ".");
                        }
                    }
                }
            }
            Step zone = parentOf.get(step.id());
            boolean ruled = step.rules() != null
                || (zone != null && ZONE.equals(zone.type()) && zone.rules() != null);
            if (!ruled) {
                add("agentWithoutRules", step.id(), step.name(), "“" + step.label() + "” has no rules: an agent works "
                    + "only under rules. Add the rules that apply to it, or to its zone.");
            }
        }

        private void human(Step step, HumanTask human) {
            if (human == null) {
                add("humanShape", step.id(), step.name(), "“" + step.label() + "” doesn't say who does it, nor what it "
                    + "asks.");
                return;
            }
            if (human.who() == null) {
                add("humanShape", step.id(), step.name(), "“" + step.label() + "” doesn't say who does it: name a person "
                    + "or a role.");
            } else {
                person(step, human.who());
            }
            if (human.question() == null) {
                add("humanShape", step.id(), step.name(), "“" + step.label() + "” doesn't say what it asks.");
            } else {
                length(step, human.question(), MAX_LINE, "The question of “" + step.label() + "”");
            }
            if (human.kind() == null || !ProcessModel.HUMAN_KINDS.contains(human.kind())) {
                add("humanShape", step.id(), step.name(), "“" + step.label() + "” is an approval, an input or a "
                    + "checklist: say which.");
                return;
            }
            boolean signed = APPROVAL.equals(human.kind()) || CHECKLIST.equals(human.kind());
            if ((signed && human.meaning() == null)
                || (human.meaning() != null && !ProcessModel.MEANINGS.contains(human.meaning()))) {
                add("humanShape", step.id(), step.name(), "“" + step.label() + "” is signed: say what the signature "
                    + "means: review, approval, responsibility or authorship.");
            }
            if (CHECKLIST.equals(human.kind())) {
                int lines = human.checklist() == null ? 0 : human.checklist().size();
                if (lines == 0) {
                    add("humanShape", step.id(), step.name(), "The checklist “" + step.label() + "” has no line.");
                } else if (lines > MAX_CHECKLIST) {
                    add("checklistTooLong", step.id(), step.name(), "The checklist “" + step.label() + "” has " + lines
                        + " lines: keep it under ten, or make what can be made impossible a rule.");
                }
                if (human.checklist() != null) {
                    human.checklist().forEach(l -> length(step, l, MAX_LINE, "A line of “" + step.label() + "”"));
                }
            }
            if (INPUT.equals(human.kind())) {
                if (human.fields() == null) {
                    add("humanShape", step.id(), step.name(), "“" + step.label() + "” asks for nothing: add what the "
                        + "person fills in.");
                } else {
                    Set<String> ids = new HashSet<>();
                    for (Field field : human.fields()) {
                        field(step, field, ids);
                    }
                }
            }
        }

        private void field(Step step, Field field, Set<String> ids) {
            String label = Objects.toString(field.label(), Objects.toString(field.id(), ""));
            if (field.id() == null || !ID.matcher(field.id()).matches() || !ids.add(field.id())) {
                add("fieldShape", step.id(), step.name(), "A field of “" + step.label() + "” needs an identifier of its "
                    + "own: letters, digits, dashes and underscores.");
            }
            if (field.label() == null) {
                add("fieldShape", step.id(), step.name(), "A field of “" + step.label() + "” needs a label.");
            } else {
                length(step, field.label(), MAX_LINE, "A label of “" + step.label() + "”");
            }
            if (field.type() == null || !Field.TYPES.contains(field.type())) {
                add("fieldShape", step.id(), step.name(), "The field “" + label + "” of “" + step.label() + "” is text, "
                    + "a number, a date, a choice, a person or a document: say which.");
            } else if ("choice".equals(field.type()) && (field.choices() == null || field.choices().size() < 2)) {
                add("fieldShape", step.id(), step.name(), "The field “" + label + "” of “" + step.label() + "” is a "
                    + "choice: give two choices at least.");
            }
        }

        private void waitFor(Step step, WaitFor wait) {
            if (wait == null || wait.kind() == null || !List.of(TIMER, MESSAGE).contains(wait.kind())) {
                add("waitWithoutWhat", step.id(), step.name(), "“" + step.label() + "” doesn't say what it waits for: a "
                    + "duration, or something a person provides.");
                return;
            }
            if (TIMER.equals(wait.kind())) {
                if (wait.duration() == null) {
                    add("waitWithoutWhat", step.id(), step.name(), "“" + step.label() + "” waits for a duration: say "
                        + "how long.");
                } else {
                    duration(step, wait.duration(), false);
                }
                return;
            }
            if (wait.what() == null) {
                add("waitWithoutWhat", step.id(), step.name(), "“" + step.label() + "” doesn't say what it waits for.");
            } else {
                length(step, wait.what(), MAX_LINE, "What “" + step.label() + "” waits for");
            }
            if (wait.from() == null) {
                add("waitWithoutWhat", step.id(), step.name(), "“" + step.label() + "” doesn't say who provides what it "
                    + "waits for.");
            } else {
                person(step, wait.from());
            }
        }

        private void lock(Step step, Lock lock) {
            if (lock.by() == null || !ProcessModel.LOCK_SOURCES.contains(lock.by())) {
                add("lockShape", step.id(), step.name(), "“" + step.label() + "” is locked: say by what, TaskForce's "
                    + "floor, a rule, the workflow's author or a pause point.");
                return;
            }
            if (!LOCK_PAUSE_POINT.equals(lock.by())) {
                return;
            }
            if (lock.ref() == null || !ProcessModel.PAUSE_POINTS.contains(lock.ref())) {
                add("lockShape", step.id(), step.name(), "“" + step.label() + "” is a pause point: before a mission, "
                    + "before applying, or before delivering. Say which.");
                return;
            }
            HumanTask human = step.human();
            if (!HUMAN.equals(step.type()) || human == null || !CHECKLIST.equals(human.kind())) {
                add("pausePointShape", step.id(), step.name(), "The pause point “" + step.label() + "” is a checklist "
                    + "that a person signs.");
            }
        }

        private void rule(Step step, RuleRef rule) {
            if (rule.ref() == null || !RULE.matcher(rule.ref()).matches()) {
                add("unknownRule", step.id(), step.name(), "“" + step.label() + "” names a rule by an identifier "
                    + "TaskForce doesn't read: " + Objects.toString(rule.ref(), "none") + ".");
            } else if (context.knownRules() != null && !context.knownRules().contains(rule.ref())) {
                add("unknownRule", step.id(), step.name(), "“" + step.label() + "” follows a rule that doesn't exist in "
                    + "this workspace: " + rule.ref() + ".");
            }
            if (rule.version() != null && rule.version() < 1) {
                add("unknownRule", step.id(), step.name(), "“" + step.label() + "” names a version of the rules that "
                    + "doesn't exist: " + rule.version() + ".");
            }
        }

        private void person(Step step, String ref) {
            if (!PERSON.matcher(ref).matches()) {
                add("badPerson", step.id(), step.name(), "“" + step.label() + "” names someone TaskForce doesn't know: "
                    + ref + ". Name a person of the workspace, its owner, its admins, or the project's lead.");
            } else if (ref.startsWith("person:") && context.members() != null
                && !context.members().contains(Long.valueOf(ref.substring(7)))) {
                add("badPerson", step.id(), step.name(), "“" + step.label() + "” names someone who isn't a member of the "
                    + "workspace.");
            }
        }

        private void duration(Step step, String value, boolean required) {
            if (value == null) {
                if (required) {
                    add("badDuration", step.id(), step.name(), "“" + step.label() + "” needs its duration.");
                }
                return;
            }
            if (!isDuration(value)) {
                add("badDuration", step.id(), step.name(), "“" + step.label() + "”: " + value + " isn't a duration (for "
                    + "example P2D for two days, PT4H for four hours).");
            }
        }

        private void length(Step step, String value, int max, String what) {
            if (value != null && value.length() > max) {
                add("tooLong", step == null ? null : step.id(), step == null ? null : step.name(),
                    what + " is longer than " + max + " characters.");
            }
        }

        // --------------------------------------------------------------------------------------------- de bout en bout

        /**
         * Chaque condition juge une étape qui la précède, par une issue que cette étape peut avoir ; deux chemins d'une
         * même décision ne prennent jamais la même issue.
         */
        private void conditions(Graph graph) {
            for (Step decision : model.allSteps()) {
                if (!DECISION.equals(decision.type())) {
                    continue;
                }
                Map<String, Flow> taken = new HashMap<>();
                for (Flow flow : graph.flowsFrom(decision.id())) {
                    Condition c = flow.condition();
                    if (flow.otherwiseFlow() || c == null || c.wordsOnly()) {
                        continue;
                    }
                    Step judged = byId.get(c.step());
                    Set<String> outcomes = judged == null ? Set.of() : outcomes(judged);
                    if (judged == null) {
                        add("conditionStep", decision.id(), decision.name(), "The decision “" + decision.label() + "” "
                            + "depends on a step that isn't there: " + c.step() + ".");
                    } else if (outcomes.isEmpty()) {
                        add("conditionStep", decision.id(), decision.name(), "The decision “" + decision.label() + "” "
                            + "depends on “" + judged.label() + "”, whose result TaskForce can't judge: a decision "
                            + "depends on an approval, or on the result of an agent's work.");
                    } else if (!outcomes.contains(c.outcome())) {
                        add("conditionStep", decision.id(), decision.name(), "The decision “" + decision.label() + "” "
                            + "waits for “" + judged.label() + "” to be " + c.outcome() + ", which it can't be: it is "
                            + String.join(" or ", outcomes) + ".");
                    } else if (!graph.reaches(judged.id(), decision.id())) {
                        add("conditionStep", decision.id(), decision.name(), "The decision “" + decision.label() + "” "
                            + "depends on “" + judged.label() + "”, which doesn't come before it.");
                    } else {
                        String key = c.step() + "|" + c.outcome();
                        if (taken.putIfAbsent(key, flow) != null) {
                            add("conditionsOverlap", decision.id(), decision.name(), "Two paths of the decision “"
                                + decision.label() + "” take the same result of “" + judged.label() + "”: keep one.");
                        }
                    }
                }
            }
        }

        private static Set<String> outcomes(Step step) {
            if (HUMAN.equals(step.type()) && step.human() != null && APPROVAL.equals(step.human().kind())) {
                return new LinkedHashSet<>(List.of(APPROVED, REFUSED));
            }
            if (AGENT.equals(step.type()) || ZONE.equals(step.type())) {
                return new LinkedHashSet<>(List.of(SUCCEEDED, FAILED));
            }
            return Set.of();
        }

        /**
         * Les trois points de pause de TF-J2-10, dès que des agents travaillent : avant une mission (aucune zone d'agent
         * ne commence sans l'avoir passé), avant d'appliquer (après le travail d'un agent), avant de livrer (après le
         * point d'avant d'appliquer).
         */
        private void pausePoints(Graph graph) {
            List<Step> zones = model.allSteps().stream().filter(s -> ZONE.equals(s.type())).toList();
            if (zones.isEmpty()) {
                return;
            }
            Map<String, List<Step>> points = new LinkedHashMap<>();
            ProcessModel.PAUSE_POINTS.forEach(p -> points.put(p, new ArrayList<>()));
            for (Step step : model.allSteps()) {
                String point = step.pausePoint();
                if (point != null && points.containsKey(point)) {
                    points.get(point).add(step);
                }
            }
            Map<String, String> moments = Map.of(BEFORE_MISSION, "the agents start", BEFORE_APPLY,
                "their changes are applied", BEFORE_DELIVERY, "the work is delivered");
            boolean missing = false;
            for (Map.Entry<String, List<Step>> e : points.entrySet()) {
                if (e.getValue().isEmpty()) {
                    missing = true;
                    add("pausePointMissing", null, null, "The pause point before " + moments.get(e.getKey()) + " is "
                        + "missing: agents work in this process, so a person checks a short list there first.");
                }
            }
            if (missing) {
                return;
            }
            Set<String> mission = new HashSet<>();
            points.get(BEFORE_MISSION).forEach(s -> mission.add(s.id()));
            Set<String> unguarded = graph.reachableAvoiding(mission);
            for (Step zone : zones) {
                if (unguarded.contains(zone.id())) {
                    add("pausePointMisplaced", zone.id(), zone.name(), "“" + zone.label() + "” can start before anyone "
                        + "has checked the list before the agents start: put that pause point before it.");
                }
            }
            boolean applyAfterWork = points.get(BEFORE_APPLY).stream()
                .anyMatch(p -> zones.stream().anyMatch(z -> graph.reaches(z.id(), p.id())));
            if (!applyAfterWork) {
                add("pausePointMisplaced", points.get(BEFORE_APPLY).get(0).id(), points.get(BEFORE_APPLY).get(0).name(),
                    "The pause point before the changes are applied comes before any agent works: put it after their "
                        + "work.");
            }
            boolean deliveryAfterApply = points.get(BEFORE_DELIVERY).stream()
                .anyMatch(d -> points.get(BEFORE_APPLY).stream().anyMatch(a -> graph.reaches(a.id(), d.id())));
            if (!deliveryAfterApply) {
                add("pausePointMisplaced", points.get(BEFORE_DELIVERY).get(0).id(),
                    points.get(BEFORE_DELIVERY).get(0).name(), "The pause point before the work is delivered comes "
                        + "before the one before the changes are applied: put it after.");
            }
        }

        /**
         * Les étapes verrouillées ne s'en vont jamais (ADR-027, séance n°25) : celles de la version en vigueur, et celles
         * du workflow par défaut dont le processus dérive, restent là, verrouillées par la même source.
         */
        private void locked() {
            List<ProcessModel> bases = new ArrayList<>(context.bases());
            if (model.derivedFrom() != null) {
                ProcessModel origin = context.defaults().get(model.derivedFrom());
                if (origin == null) {
                    add("unknownDefault", null, null, "This process says it comes from a default workflow TaskForce "
                        + "doesn't have: " + model.derivedFrom() + ".");
                } else {
                    bases.add(origin);
                }
            }
            Set<String> reported = new HashSet<>();
            for (ProcessModel base : bases) {
                for (Step required : base.allSteps()) {
                    if (required.lock() == null || required.id() == null || !reported.add(required.id())) {
                        continue;
                    }
                    Step kept = byId.get(required.id());
                    String source = source(required.lock());
                    if (kept == null) {
                        add("lockedStepMissing", required.id(), required.name(), "“" + required.label() + "” is required "
                            + "by " + source + ": it can't be removed.");
                    } else if (!Objects.equals(kept.type(), required.type())
                        || !Objects.equals(kept.lock(), required.lock())) {
                        add("lockedStepUnlocked", required.id(), required.name(), "“" + required.label() + "” is "
                            + "required by " + source + ": it stays what it is, and locked.");
                    }
                }
            }
        }

        private static String source(Lock lock) {
            return switch (Objects.toString(lock.by(), "")) {
                case ProcessModel.LOCK_FLOOR -> "TaskForce";
                case ProcessModel.LOCK_RULE -> lock.ref() == null ? "a rule" : "the rule " + lock.ref();
                case ProcessModel.LOCK_AUTHOR -> "the workflow's author";
                case LOCK_PAUSE_POINT -> "a pause point";
                default -> "its lock";
            };
        }

        // --------------------------------------------------------------------------------------------- outils

        private String label(String id) {
            Step step = id == null ? null : byId.get(id);
            return step == null ? Objects.toString(id, "") : step.label();
        }

        private void add(String code, String stepId, String step, String message) {
            problems.add(new Problem(code, stepId, step, message));
        }
    }

    // ------------------------------------------------------------------------------------------------- le graphe

    /**
     * Le processus mis à plat, pour ce qui se vérifie de bout en bout : entrer dans une étape de haut niveau, c'est
     * entrer à son début ; en sortir, c'est quitter une de ses fins ; une zone mène à ses étapes d'agent, qui mènent où
     * mène la zone ; une échéance ou un chemin d'échec part de l'étape qu'il surveille (pour une étape de haut niveau,
     * dès son début).
     */
    static final class Graph {

        private final Map<String, Set<String>> edges = new HashMap<>();
        private final Map<String, List<Flow>> flowsFrom = new HashMap<>();
        private String start;

        static Graph of(ProcessModel model) {
            Graph g = new Graph();
            g.start = model.stepsOrEmpty().stream().filter(s -> START.equals(s.type())).findFirst().map(Step::id)
                .orElse(null);
            g.container(model.stepsOrEmpty(), model.flowsOrEmpty());
            return g;
        }

        private void container(List<Step> steps, List<Flow> flows) {
            Map<String, Step> local = new HashMap<>();
            steps.forEach(s -> local.put(s.id(), s));
            for (Flow f : flows) {
                flowsFrom.computeIfAbsent(f.from(), k -> new ArrayList<>()).add(f);
                for (String from : exits(local.get(f.from()))) {
                    edge(from, entry(local.get(f.to())));
                }
            }
            for (Step s : steps) {
                if (s.boundary() && s.attachedTo() != null && local.containsKey(s.attachedTo())) {
                    edge(entry(local.get(s.attachedTo())), s.id());
                    edge(s.attachedTo(), s.id());
                }
                if (STAGE.equals(s.type())) {
                    edge(s.id(), entry(s));
                    container(s.stepsOrEmpty(), s.flowsOrEmpty());
                }
                if (ZONE.equals(s.type())) {
                    for (Step inner : s.stepsOrEmpty()) {
                        edge(s.id(), inner.id());
                        for (Flow f : flows) {
                            if (s.id().equals(f.from())) {
                                edge(inner.id(), entry(local.get(f.to())));
                            }
                        }
                    }
                }
            }
        }

        /** Où l'on entre dans une étape : le début d'une étape de haut niveau, l'étape elle-même sinon. */
        private static String entry(Step step) {
            if (step != null && STAGE.equals(step.type())) {
                return step.stepsOrEmpty().stream().filter(s -> START.equals(s.type())).findFirst().map(Step::id)
                    .orElse(step.id());
            }
            return step == null ? null : step.id();
        }

        /** D'où l'on sort d'une étape : les fins d'une étape de haut niveau, l'étape elle-même sinon. */
        private static List<String> exits(Step step) {
            if (step != null && STAGE.equals(step.type())) {
                List<String> ends = step.stepsOrEmpty().stream().filter(s -> END.equals(s.type())).map(Step::id).toList();
                return ends.isEmpty() ? List.of(step.id()) : ends;
            }
            return step == null ? List.of() : List.of(step.id());
        }

        private void edge(String from, String to) {
            if (from != null && to != null) {
                edges.computeIfAbsent(from, k -> new LinkedHashSet<>()).add(to);
            }
        }

        List<Flow> flowsFrom(String id) {
            return flowsFrom.getOrDefault(id, List.of());
        }

        /** Vrai quand un chemin d'au moins un pas mène de {@code from} à {@code to}. */
        boolean reaches(String from, String to) {
            Set<String> next = edges.getOrDefault(from, Set.of());
            return walk(next, edges).contains(to);
        }

        /** Ce qu'on rejoint depuis le début sans passer par {@code avoided}. */
        Set<String> reachableAvoiding(Set<String> avoided) {
            if (start == null) {
                return Set.of();
            }
            Map<String, Set<String>> cut = new HashMap<>();
            edges.forEach((k, v) -> {
                if (!avoided.contains(k)) {
                    cut.put(k, v);
                }
            });
            Set<String> seen = walk(Set.of(start), cut);
            seen.removeAll(avoided);
            return seen;
        }
    }

    static Set<String> walk(Set<String> from, Map<String, Set<String>> edges) {
        Set<String> seen = new LinkedHashSet<>(from);
        Deque<String> todo = new ArrayDeque<>(from);
        while (!todo.isEmpty()) {
            for (String next : edges.getOrDefault(todo.pop(), Set.of())) {
                if (seen.add(next)) {
                    todo.push(next);
                }
            }
        }
        return seen;
    }

    /** Une durée ISO 8601, comme {@code P2D}, {@code PT4H} ou {@code P1DT12H}, plus longue que zéro. */
    static boolean isDuration(String value) {
        if (value == null || !value.startsWith("P")) {
            return false;
        }
        try {
            int t = value.indexOf('T');
            if (t < 0) {
                return !Period.parse(value).isNegative() && !Period.parse(value).isZero();
            }
            String date = value.substring(0, t);
            Period period = date.equals("P") ? Period.ZERO : Period.parse(date);
            Duration time = Duration.parse("P" + value.substring(t));
            return !period.isNegative() && !time.isNegative() && !(period.isZero() && time.isZero());
        } catch (DateTimeParseException e) {
            return false;
        }
    }
}
