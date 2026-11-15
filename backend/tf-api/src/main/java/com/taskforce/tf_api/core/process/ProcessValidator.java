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
    /**
     * La plus grande profondeur d'étapes qu'on lit : un processus en a trois (ses phases, leurs étapes et leurs zones,
     * les étapes d'une zone) ; au-delà de huit, rien ne se parcourt, ni pour vérifier ni pour calculer l'empreinte.
     */
    public static final int MAX_DEPTH = 8;
    /** Les refus qu'on dit un à un ; au-delà, leur nombre. */
    public static final int MAX_PROBLEMS = 50;
    static final int MAX_NAME = 200;
    static final int MAX_TEXT = 2000;
    static final int MAX_LINE = 300;
    // Les bornes du brouillon (taskforce-process-draft-1.schema.json), que le vérificateur tient pour tout ce qui entre.
    static final int MAX_REF = 80;
    static final int MAX_MODEL = 120;
    static final int MAX_RULES = 20;
    static final int MAX_DOCUMENTS = 10;
    static final int MAX_FIELDS = 12;
    static final int MAX_CHOICES = 12;
    static final int MAX_TOOLS = 20;
    /** Une liste de contrôle a moins de dix lignes (Gawande, séance n°25). */
    public static final int MAX_CHECKLIST = 9;
    /** Une étape d'agent se tente trois fois au plus, puis l'incident (ADR-023). */
    public static final int MAX_ATTEMPTS = 3;

    static final Pattern KEY = Pattern.compile("^[a-z][a-z0-9-]{0,79}$");
    static final Pattern ID = Pattern.compile("^[A-Za-z][A-Za-z0-9_-]{0,79}$");
    /**
     * Qui répond, qui fait, qui fournit : comme ceux qui accordent une règle (RuleValidator.APPROVER), avec un numéro de
     * dix-huit chiffres au plus, qui tient toujours dans l'identifiant d'une personne.
     */
    static final Pattern PERSON = Pattern.compile("^(person:[0-9]{1,18}|role:(owner|admin)|project-lead)$");
    static final Pattern RULE = Pattern.compile("^[a-z0-9][a-z0-9-]{1,79}$");
    static final Pattern PROVIDER = Pattern.compile("^[a-z][a-z0-9-]{1,39}$");
    static final Pattern TOOL = Pattern.compile("^[a-z0-9][a-z0-9._-]{0,79}$");
    static final Pattern ISSUE = Pattern.compile("^[A-Za-z][A-Za-z0-9]{0,19}-[0-9]{1,9}$");

    /**
     * Les refus qui rendent la forme du processus trop incertaine pour les vérifications de bout en bout ; des chemins en
     * parallèle qui ne se rejoignent pas comme il faut en font partie : le graphe de bout en bout ne voit pas le
     * parallèle.
     */
    private static final Set<String> STRUCTURAL = Set.of("tooLarge", "badId", "duplicateId", "unknownType", "flowUnknown",
        "flowAcross", "startCount", "endMissing", "notInSubset", "joinShape", "splitInLoop");

    private ProcessValidator() {
    }

    /** Un refus : son code, l'étape qu'il vise (son identifiant et son nom, ou null), et sa phrase. */
    public record Problem(String code, String stepId, String step, String message) {
    }

    /**
     * Ce qu'un fichier importé contenait hors du sous-ensemble : l'élément, l'étape où il était, son nom, et ce qui le
     * précise quand la raison le cite (un réglage et sa valeur, la langue d'une condition), ou null.
     */
    public record Foreign(String element, String stepId, String name, String detail) {

        public Foreign(String element, String stepId, String name) {
            this(element, stepId, name, null);
        }
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
        List<Problem> all = new Run(model, context == null ? Context.NONE : context)
            .check(foreign == null ? List.of() : foreign);
        if (all.size() <= MAX_PROBLEMS) {
            return all;
        }
        // Un fichier de mille fautes se reprend par les premières : le reste se compte.
        List<Problem> first = new ArrayList<>(all.subList(0, MAX_PROBLEMS));
        first.add(new Problem("moreProblems", null, null, "There are " + (all.size() - MAX_PROBLEMS) + " more "
            + "problems: fix these first, then check again."));
        return first;
    }

    /**
     * La profondeur des étapes d'un processus (1 pour les siennes, 2 pour celles d'une phase...), lue sans récursion et
     * jamais au-delà de {@link #MAX_DEPTH} plus un : un modèle trop profond ne se parcourt pas.
     */
    public static int depth(ProcessModel model) {
        int depth = 0;
        List<Step> level = model.stepsOrEmpty();
        while (!level.isEmpty() && depth <= MAX_DEPTH) {
            depth++;
            List<Step> next = new ArrayList<>();
            level.forEach(s -> next.addAll(s.stepsOrEmpty()));
            level = next;
        }
        return depth;
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
        /** Les points de pause déjà refusés sur un chemin en parallèle : un refus chacun. */
        private final Set<String> parallelPausePoints = new HashSet<>();

        Run(ProcessModel model, Context context) {
            this.model = model;
            this.context = context;
        }

        List<Problem> check(List<Foreign> foreign) {
            for (Foreign f : foreign) {
                add("notInSubset", f.stepId(), f.name(), ProcessSubset.reason(f.element(), f.name() != null ? f.name()
                    : f.stepId(), f.detail()));
            }
            // Un fichier qui sort du sous-ensemble se reprend d'abord là : le reste de ses refus en découlerait.
            if (!foreign.isEmpty()) {
                return problems;
            }
            if (depth(model) > MAX_DEPTH) {
                add("tooDeep", null, null, "This process nests its steps more than " + MAX_DEPTH + " levels deep: a "
                    + "process holds its stages, a stage its steps and agent zones, a zone its agent steps.");
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
                decisionLoops(graph);
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
                } else if (step.id().equals(model.key())) {
                    add("duplicateId", step.id(), step.name(), keyTaken("“" + step.label() + "”", step.id()));
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
                } else if (flow.id().equals(model.key())) {
                    add("duplicateId", flow.id(), null, keyTaken("A path", flow.id()));
                }
                if (flow.name() != null && flow.name().length() > MAX_NAME) {
                    add("tooLong", flow.id(), null, "The name of the path " + Objects.toString(flow.id(), "") + " is "
                        + "longer than " + MAX_NAME + " characters.");
                }
            }
        }

        /** Le fichier BPMN donne la clé du processus au processus lui-même : une étape ou un chemin ne la prend pas. */
        private static String keyTaken(String what, String id) {
            return what + " has the process's own key as its identifier, " + id + ": in the exported file, that "
                + "identifier is the process's. Give it another one.";
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
                // Ce qu'une étape de la zone tiendrait échapperait au reste de la vérification, une étape verrouillée
                // comprise : la zone est le dernier niveau.
                if (!inner.stepsOrEmpty().isEmpty() || !inner.flowsOrEmpty().isEmpty()) {
                    add("notAContainer", inner.id(), inner.name(), "“" + inner.label() + "” holds other steps, which only "
                        + "a stage or an agent zone does.");
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
            if (linked) {
                Blocks blocks = new Blocks(local, out, in);
                blocks.judge();
                blocks.pausePoints();
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
                // Une échéance mènerait plus loin sans que personne ait passé la liste : un point de pause attend.
                if (host != null && host.pausePoint() != null) {
                    add("pausePointDeadline", step.id(), step.name(), "The pause point “" + host.label() + "” has a "
                        + "deadline, “" + step.label() + "”: the process would go on without anyone checking its list. "
                        + "A pause point waits for its person: remove the deadline.");
                }
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

        // --------------------------------------------------------------------------------------------- en parallèle

        /**
         * Les chemins en parallèle d'un conteneur. Un partage lance des chemins ; chacun va de son premier pas jusqu'à
         * une jonction ou à une fin, et passe d'un seul bond ce qu'un partage plus loin lance et rejoint (son bloc). Ce
         * que tient un de ces chemins tourne en même temps que les autres.
         */
        private final class Blocks {

            private final Map<String, Step> local;
            private final Map<String, List<Flow>> out;
            private final Map<String, List<Flow>> in;
            /** Les échéances et les chemins d'échec de chaque étape : ils continuent son chemin. */
            private final Map<String, List<Step>> watching = new HashMap<>();
            private final Map<String, Block> blocks = new HashMap<>();
            private final Set<String> open = new HashSet<>();

            Blocks(Map<String, Step> local, Map<String, List<Flow>> out, Map<String, List<Flow>> in) {
                this.local = local;
                this.out = out;
                this.in = in;
                for (Step s : local.values()) {
                    if (s.boundary() && s.attachedTo() != null && local.containsKey(s.attachedTo())) {
                        watching.computeIfAbsent(s.attachedTo(), k -> new ArrayList<>()).add(s);
                    }
                }
            }

            private List<Flow> outs(String id) {
                return out.getOrDefault(id, List.of());
            }

            private List<Flow> ins(String id) {
                return in.getOrDefault(id, List.of());
            }

            boolean isSplit(Step s) {
                return PARALLEL.equals(s.type()) && ins(s.id()).size() <= 1 && outs(s.id()).size() >= 2;
            }

            boolean isJoin(Step s) {
                return PARALLEL.equals(s.type()) && ins(s.id()).size() >= 2 && outs(s.id()).size() <= 1;
            }

            /** Le bloc d'un partage ; null quand le partage se retrouve dans son propre bloc (une boucle). */
            Block block(Step split) {
                Block known = blocks.get(split.id());
                if (known != null || !open.add(split.id())) {
                    return known;
                }
                List<Branch> branches = new ArrayList<>();
                for (Flow first : outs(split.id())) {
                    branches.add(branch(split, first));
                }
                Set<String> joins = new LinkedHashSet<>();
                branches.forEach(b -> b.arrivals().forEach(f -> joins.add(f.to())));
                Block block = new Block(split, branches, joins.size() == 1 ? local.get(joins.iterator().next()) : null);
                open.remove(split.id());
                blocks.put(split.id(), block);
                return block;
            }

            private Branch branch(Step split, Flow first) {
                Set<String> nodes = new LinkedHashSet<>();
                List<Flow> arrivals = new ArrayList<>();
                boolean ends = false;
                boolean unclear = false;
                Deque<Hop> todo = new ArrayDeque<>();
                todo.push(new Hop(first.to(), first));
                while (!todo.isEmpty()) {
                    Hop hop = todo.pop();
                    Step step = local.get(hop.to());
                    if (step == null) {
                        continue;
                    }
                    if (step.id().equals(split.id())) {
                        // Le chemin revient à son propre partage : une boucle.
                        unclear = true;
                        continue;
                    }
                    if (isJoin(step)) {
                        if (hop.via() != null && !arrivals.contains(hop.via())) {
                            arrivals.add(hop.via());
                        }
                        continue;
                    }
                    if (!nodes.add(step.id())) {
                        continue;
                    }
                    if (END.equals(step.type())) {
                        ends = true;
                        continue;
                    }
                    List<Flow> next = outs(step.id());
                    if (isSplit(step)) {
                        Block inner = block(step);
                        if (inner == null) {
                            unclear = true;
                            continue;
                        }
                        inner.branches().forEach(b -> nodes.addAll(b.nodes()));
                        unclear |= inner.branches().stream().anyMatch(Branch::unclear);
                        if (inner.join() == null) {
                            boolean joined = inner.branches().stream().anyMatch(b -> !b.arrivals().isEmpty());
                            unclear |= joined;
                            ends |= !joined;
                            continue;
                        }
                        nodes.add(inner.join().id());
                        next = outs(inner.join().id());
                    }
                    for (Flow f : next) {
                        todo.push(new Hop(f.to(), f));
                    }
                    for (Step b : watching.getOrDefault(step.id(), List.of())) {
                        todo.push(new Hop(b.id(), null));
                    }
                }
                return new Branch(nodes, arrivals, ends, unclear);
            }

            /**
             * Des chemins en parallèle qui finissent toujours : un partage n'est dans aucune boucle de son conteneur ; ses
             * chemins se retrouvent tous à une même jonction, chacun par un seul chemin, ou finissent chacun de leur
             * côté, sans se croiser ni rien recevoir d'ailleurs ; une jonction ne joint que les chemins d'un partage.
             */
            void judge() {
                Set<String> joined = new HashSet<>();
                for (Step split : local.values()) {
                    if (!isSplit(split)) {
                        continue;
                    }
                    Block block = block(split);
                    if (block != null) {
                        block.branches().forEach(b -> b.arrivals().forEach(f -> joined.add(f.to())));
                    }
                    if (inLoop(split)) {
                        add("splitInLoop", split.id(), split.name(), "“" + split.label() + "” splits paths in parallel "
                            + "inside a loop: each time round it would start them again, while the others may still "
                            + "run. Loop around the whole stage instead.");
                    } else if (block != null) {
                        String fault = fault(block);
                        if (fault != null) {
                            add("joinShape", split.id(), split.name(), fault);
                        }
                    }
                }
                for (Step join : local.values()) {
                    if (isJoin(join) && !joined.contains(join.id())) {
                        add("joinShape", join.id(), join.name(), "“" + join.label() + "” joins paths that don't come "
                            + "from one split: a parallel join waits for every path a split started, and these never "
                            + "all come.");
                    }
                }
            }

            /** Vrai quand le partage se rejoint depuis ce qui le suit, dans son conteneur. */
            private boolean inLoop(Step split) {
                Set<String> seen = new HashSet<>();
                Deque<String> todo = new ArrayDeque<>(next(split.id()));
                while (!todo.isEmpty()) {
                    String id = todo.pop();
                    if (id.equals(split.id())) {
                        return true;
                    }
                    if (seen.add(id)) {
                        todo.addAll(next(id));
                    }
                }
                return false;
            }

            private List<String> next(String id) {
                List<String> out = new ArrayList<>();
                outs(id).forEach(f -> out.add(f.to()));
                watching.getOrDefault(id, List.of()).forEach(b -> out.add(b.id()));
                return out;
            }

            /** Ce qui fait qu'un bloc ne finirait pas, en une phrase ; null quand il finit. */
            private String fault(Block block) {
                if (block.branches().stream().anyMatch(Branch::unclear)) {
                    // Une boucle, ou un bloc plus loin qui ne finit pas : dit pour lui.
                    return null;
                }
                String split = block.split().label();
                Set<String> seen = new HashSet<>();
                for (Branch branch : block.branches()) {
                    for (String id : branch.nodes()) {
                        if (!seen.add(id)) {
                            return "Two paths that “" + split + "” runs in parallel meet at “" + label(id) + "” before "
                                + "any join: “" + label(id) + "” would run twice. Join them with a parallel join first.";
                        }
                    }
                }
                Set<String> joins = new LinkedHashSet<>();
                Set<Flow> arrivals = new HashSet<>();
                block.branches().forEach(b -> b.arrivals().forEach(f -> {
                    joins.add(f.to());
                    arrivals.add(f);
                }));
                if (joins.size() > 1) {
                    return "The paths that “" + split + "” runs in parallel meet again at different joins: make them "
                        + "all go on to the same one.";
                }
                Step join = block.join();
                for (Branch branch : block.branches()) {
                    if (branch.arrivals().size() > 1) {
                        return "A path that “" + split + "” starts comes into “" + join.label() + "” more than once: a "
                            + "parallel join waits for one arrival of each path.";
                    }
                    if (!branch.arrivals().isEmpty() && branch.ends()) {
                        return "One of the paths that “" + split + "” runs in parallel can end before “" + join.label()
                            + "”: the join would wait for it forever. Let it go on to the join.";
                    }
                }
                if (join != null && !new HashSet<>(ins(join.id())).equals(arrivals)) {
                    return "“" + join.label() + "” waits for a path that “" + split + "” doesn't start: a parallel join "
                        + "joins the paths of one split, and only those.";
                }
                for (Branch branch : block.branches()) {
                    for (String id : branch.nodes()) {
                        for (String from : before(id)) {
                            if (!from.equals(block.split().id()) && !branch.nodes().contains(from)) {
                                return "A path comes into what “" + split + "” runs in parallel from outside, at “"
                                    + label(id) + "”: it would go on without the others. Let it come in before the "
                                    + "split.";
                            }
                        }
                    }
                }
                return null;
            }

            /** D'où l'on arrive à une étape : ses chemins entrants, et l'étape qu'elle surveille. */
            private List<String> before(String id) {
                List<String> from = new ArrayList<>();
                ins(id).forEach(f -> from.add(f.from()));
                Step step = local.get(id);
                if (step != null && step.boundary() && step.attachedTo() != null) {
                    from.add(step.attachedTo());
                }
                return from;
            }

            /**
             * Un point de pause n'est sur aucun des chemins d'un partage : les autres chemins iraient sans attendre que
             * sa liste soit passée. Pour une étape de haut niveau sur un de ces chemins, ce sont les siens.
             */
            void pausePoints() {
                for (Step split : local.values()) {
                    if (!isSplit(split)) {
                        continue;
                    }
                    Block block = block(split);
                    if (block == null) {
                        continue;
                    }
                    for (Branch branch : block.branches()) {
                        for (String id : branch.nodes()) {
                            List<Step> inside = new ArrayList<>();
                            within(local.get(id), inside);
                            for (Step s : inside) {
                                if (s.pausePoint() != null && s.id() != null && parallelPausePoints.add(s.id())) {
                                    add("pausePointInParallel", s.id(), s.name(), "The pause point “" + s.label() + "” is "
                                        + "on one of the paths that “" + split.label() + "” runs in parallel: the others "
                                        + "would go on without waiting for its list. Put it before the split, or after "
                                        + "the join.");
                                }
                            }
                        }
                    }
                }
            }
        }

        /** Une étape et tout ce qu'elle tient, à tous les niveaux. */
        private static void within(Step step, List<Step> out) {
            out.add(step);
            step.stepsOrEmpty().forEach(s -> within(s, out));
        }

        /** Un pas d'un chemin : l'étape où il mène, et le chemin qui y mène (nul pour une échéance ou un échec). */
        private record Hop(String to, Flow via) {
        }

        /**
         * Un chemin lancé par un partage : les étapes qu'il tient, les chemins par lesquels il entre dans une jonction,
         * s'il peut finir avant, et s'il est trop embrouillé pour en juger (il revient à son partage).
         */
        private record Branch(Set<String> nodes, List<Flow> arrivals, boolean ends, boolean unclear) {
        }

        /** Le bloc d'un partage : ses chemins, et la jonction où ils se retrouvent (nulle quand il n'y en a pas une seule). */
        private record Block(Step split, List<Branch> branches, Step join) {
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
                count(step, "“" + step.label() + "”", step.rules(), MAX_RULES, "rules");
                for (RuleRef rule : step.rules()) {
                    rule(step, rule);
                }
            }
            if (step.documents() != null) {
                count(step, "“" + step.label() + "”", step.documents(), MAX_DOCUMENTS, "documents");
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
                length(step, step.agent().model(), MAX_MODEL, "The model of “" + step.label() + "”");
                if (step.agent().tools() != null) {
                    count(step, "“" + step.label() + "”", step.agent().tools(), MAX_TOOLS, "tools");
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
                    count(step, "“" + step.label() + "”", human.fields(), MAX_FIELDS, "fields");
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
            if (field.choices() != null) {
                count(step, "The field “" + label + "” of “" + step.label() + "”", field.choices(), MAX_CHOICES,
                    "choices");
                field.choices().forEach(c -> length(step, c, MAX_LINE, "A choice of “" + label + "”"));
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
            length(step, lock.ref(), MAX_REF, "What locks “" + step.label() + "”");
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

        /** Une liste plus longue que ce que le brouillon permet ({@code taskforce-process-draft-1.schema.json}). */
        private void count(Step step, String subject, List<?> values, int max, String what) {
            if (values.size() > max) {
                add("tooMany", step.id(), step.name(), subject + " has " + values.size() + " " + what + ": " + max
                    + " at most.");
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

        /**
         * Une décision qui revient à elle-même sans que l'étape qu'elle juge ait tourné de nouveau prendrait le même chemin
         * pour toujours : l'issue qu'elle juge n'a pas changé. Le chemin de tous les autres cas revient par l'une des
         * étapes qu'elle juge ; un chemin à condition, par celle de sa condition. Une étape d'agent tourne avec sa zone.
         */
        private void decisionLoops(Graph graph) {
            for (Step decision : model.allSteps()) {
                if (!DECISION.equals(decision.type()) || decision.id() == null) {
                    continue;
                }
                List<Flow> paths = graph.flowsFrom(decision.id());
                Set<String> judged = new LinkedHashSet<>();
                for (Flow f : paths) {
                    if (judges(f)) {
                        judged.add(f.condition().step());
                    }
                }
                for (Flow f : paths) {
                    Set<String> again = new LinkedHashSet<>();
                    if (f.otherwiseFlow()) {
                        again.addAll(judged);
                    } else if (judges(f)) {
                        again.add(f.condition().step());
                    }
                    if (again.isEmpty() || f.to() == null) {
                        continue;
                    }
                    Set<String> avoided = new LinkedHashSet<>(again);
                    for (String id : again) {
                        Step zone = parentOf.get(id);
                        if (zone != null && ZONE.equals(zone.type())) {
                            avoided.add(zone.id());
                        }
                    }
                    if (!graph.reachableFrom(graph.entryOf(f.to()), avoided).contains(decision.id())) {
                        continue;
                    }
                    if (f.to().equals(decision.id())) {
                        add("decisionLoop", decision.id(), decision.name(), "The decision “" + decision.label() + "” has "
                            + "a path back to itself: it would take it forever.");
                    } else {
                        String steps = String.join(" or ", again.stream().map(id -> "“" + label(id) + "”").toList());
                        add("decisionLoop", decision.id(), decision.name(), "The decision “" + decision.label() + "” "
                            + "comes back to itself by the path to “" + label(f.to()) + "” without " + steps + " running "
                            + "again: it would take the same path forever. Put " + steps + " on the way back.");
                    }
                }
            }
        }

        /** Vrai pour un chemin dont la condition juge une étape qui est là. */
        private boolean judges(Flow f) {
            return !f.otherwiseFlow() && f.condition() != null && !f.condition().wordsOnly()
                && byId.containsKey(f.condition().step());
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
         * Les trois points de pause de TF-J2-10, dès que des agents travaillent, et aucun ne se contourne : aucune zone
         * d'agent ne commence sans être passée par celui d'avant une mission ; celui d'avant d'appliquer vient après le
         * travail d'un agent, et on ne rejoint celui d'avant de livrer qu'en passant par lui ; aucun travail d'agent ne
         * mène à une fin du processus sans passer par celui d'avant de livrer. Une échéance ne passe jamais un point de
         * pause, et aucun n'est sur un chemin en parallèle : ces deux refus se disent avec les chemins de leur conteneur.
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
            // Comme celui d'avant une mission : chaque chemin vers le point d'avant de livrer passe par celui d'avant
            // d'appliquer, et chaque chemin du travail d'un agent à une fin du processus passe par celui d'avant de
            // livrer. Une fin qui arrête tout ne livre rien : elle abandonne.
            Set<String> apply = new HashSet<>();
            points.get(BEFORE_APPLY).forEach(s -> apply.add(s.id()));
            Set<String> beforeApply = graph.reachableAvoiding(apply);
            for (Step delivery : points.get(BEFORE_DELIVERY)) {
                if (beforeApply.contains(delivery.id())) {
                    add("pausePointMisplaced", delivery.id(), delivery.name(), "The pause point “" + delivery.label()
                        + "” can be reached before anyone has checked the list before the changes are applied: every "
                        + "path to it goes through that pause point first.");
                }
            }
            Set<String> delivery = new HashSet<>();
            points.get(BEFORE_DELIVERY).forEach(s -> delivery.add(s.id()));
            Set<String> ends = new LinkedHashSet<>();
            model.stepsOrEmpty().stream().filter(s -> END.equals(s.type()) && !Boolean.TRUE.equals(s.terminate()))
                .forEach(s -> ends.add(s.id()));
            for (Step zone : zones) {
                Set<String> after = graph.reachableFrom(zone.id(), delivery);
                String end = ends.stream().filter(after::contains).findFirst().orElse(null);
                if (end != null) {
                    // Le chemin qui contourne le point se dit une fois, depuis le premier travail d'agent qui y mène.
                    add("pausePointMisplaced", zone.id(), zone.name(), "The work of “" + zone.label() + "” can reach “"
                        + label(end) + "” without the pause point before the work is delivered: every path from an "
                        + "agent's work to the end goes through it.");
                    break;
                }
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
        /** Où l'on entre dans chaque étape : le début d'une étape de haut niveau, l'étape elle-même sinon. */
        private final Map<String, String> entries = new HashMap<>();
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
            steps.forEach(s -> entries.put(s.id(), entry(s)));
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

        String entryOf(String id) {
            return entries.getOrDefault(id, id);
        }

        /** Vrai quand un chemin d'au moins un pas mène de {@code from} à {@code to}. */
        boolean reaches(String from, String to) {
            Set<String> next = edges.getOrDefault(from, Set.of());
            return walk(next, edges).contains(to);
        }

        /** Ce qu'on rejoint depuis le début sans passer par {@code avoided}. */
        Set<String> reachableAvoiding(Set<String> avoided) {
            return start == null ? Set.of() : reachableFrom(start, avoided);
        }

        /** Ce qu'on rejoint depuis {@code from} (compris) sans passer par {@code avoided}. */
        Set<String> reachableFrom(String from, Set<String> avoided) {
            if (from == null || avoided.contains(from)) {
                return Set.of();
            }
            Map<String, Set<String>> cut = new HashMap<>();
            edges.forEach((k, v) -> {
                if (!avoided.contains(k)) {
                    cut.put(k, v);
                }
            });
            Set<String> seen = walk(Set.of(from), cut);
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

    /**
     * La forme d'une durée de XML Schema, sans signe : des années, des mois, des jours, puis des heures, des minutes et
     * des secondes. Ni semaines ({@code P1W}) ni minuscules : le fichier BPMN les refuserait, comme un moteur.
     */
    private static final Pattern DURATION = Pattern.compile(
        "^P(?=\\d|T\\d)(\\d+Y)?(\\d+M)?(\\d+D)?(T(?=\\d)(\\d+H)?(\\d+M)?(\\d+(\\.\\d+)?S)?)?$");

    /** Une durée ISO 8601, comme {@code P2D}, {@code PT4H} ou {@code P1DT12H}, plus longue que zéro. */
    static boolean isDuration(String value) {
        if (value == null || !DURATION.matcher(value).matches()) {
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
