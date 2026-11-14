package com.taskforce.tf_api.core.process;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Un processus (ADR-027, TF-J2-2) : notre modèle, en données, forme de référence d'un processus. Le XML de BPMN 2.0
 * n'en est qu'un format d'échange ({@link BpmnExport}, {@link BpmnImport}) ; l'empreinte d'une version se calcule sur
 * ce modèle ({@link ProcessFingerprint}), jamais sur le texte d'un fichier.
 *
 * <p>Les étapes s'emboîtent : le processus tient son début, ses fins, ses étapes de haut niveau (les colonnes de la
 * vue), ses décisions et ses partages ; une étape de haut niveau tient ses étapes et ses chemins ; une zone d'agent
 * tient les étapes que l'agent fait dans l'ordre qu'il choisit. Cinq types d'étapes ({@link #AGENT}, {@link #HUMAN},
 * {@link #DECISION}, {@link #WAIT}, {@link #ZONE}), pas de sixième ; le reste est de la structure.</p>
 *
 * <p>Chaque enregistrement se normalise à la construction : une chaîne vide devient nulle, une liste vide aussi, un
 * booléen faux aussi. Deux écritures du même processus (un JSON qui omet un champ, un autre qui le met à null, un
 * fichier qu'un modeleur a réécrit) donnent donc le même modèle et la même empreinte. Les méthodes d'aide ne
 * commencent ni par {@code get} ni par {@code is} : Jackson les prendrait pour des champs du JSON. Les
 * annotations {@code @Schema} ne font que nommer ces types dans la référence d'API ({@code ProcessStep}...) : un
 * {@code Step} d'un autre domaine y cacherait celui-ci.</p>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProcessModel(
    String format,
    String key,
    String name,
    String description,
    String derivedFrom,
    List<Step> steps,
    List<Flow> flows) {

    /** Le format de ce modèle, comme {@code taskforce-rules/1} pour les règles. */
    public static final String FORMAT = "taskforce-process/1";

    // La structure : le début, la fin, l'étape de haut niveau, le partage en parallèle, l'échéance et le chemin d'un échec.
    public static final String START = "start";
    public static final String END = "end";
    public static final String STAGE = "stage";
    public static final String PARALLEL = "parallel";
    public static final String DEADLINE = "deadline";
    public static final String FAILURE = "failure";
    // Les cinq types d'étapes.
    public static final String AGENT = "agent";
    public static final String HUMAN = "human";
    public static final String DECISION = "decision";
    public static final String WAIT = "wait";
    public static final String ZONE = "zone";

    /** Les cinq types d'étapes : chacun a une personne qui en répond. */
    public static final List<String> STEP_TYPES = List.of(AGENT, HUMAN, DECISION, WAIT, ZONE);
    /** Tous les types que le modèle connaît. */
    public static final List<String> TYPES = List.of(START, END, STAGE, AGENT, HUMAN, DECISION, WAIT, ZONE, PARALLEL,
        DEADLINE, FAILURE);

    // Les sortes de tâche humaine, et ce que signifie la signature (21 CFR 11.50).
    public static final String APPROVAL = "approval";
    public static final String INPUT = "input";
    public static final String CHECKLIST = "checklist";
    public static final List<String> HUMAN_KINDS = List.of(APPROVAL, INPUT, CHECKLIST);
    public static final List<String> MEANINGS = List.of("review", "approval", "responsibility", "authorship");

    // Ce qui verrouille une étape (séance n°25) : le socle, une règle, l'auteur du workflow, un point de pause.
    public static final String LOCK_FLOOR = "floor";
    public static final String LOCK_RULE = "rule";
    public static final String LOCK_AUTHOR = "author";
    public static final String LOCK_PAUSE_POINT = "pause-point";
    public static final List<String> LOCK_SOURCES = List.of(LOCK_FLOOR, LOCK_RULE, LOCK_AUTHOR, LOCK_PAUSE_POINT);

    // Les trois points de pause de TF-J2-10 (R148) : avant une mission, avant d'appliquer, avant de livrer.
    public static final String BEFORE_MISSION = "before-mission";
    public static final String BEFORE_APPLY = "before-apply";
    public static final String BEFORE_DELIVERY = "before-delivery";
    public static final List<String> PAUSE_POINTS = List.of(BEFORE_MISSION, BEFORE_APPLY, BEFORE_DELIVERY);

    // Ce qu'attend une attente : une durée, ou un message (un document fourni, une réponse).
    public static final String TIMER = "timer";
    public static final String MESSAGE = "message";

    // Ce qu'une décision peut juger, par du code : l'issue d'un accord, ou celle du travail d'un agent.
    public static final String APPROVED = "approved";
    public static final String REFUSED = "refused";
    public static final String SUCCEEDED = "succeeded";
    public static final String FAILED = "failed";

    public ProcessModel {
        format = clean(format);
        key = clean(key);
        name = line(name);
        description = clean(description);
        derivedFrom = clean(derivedFrom);
        steps = cleanList(steps);
        flows = cleanList(flows);
    }

    /**
     * Une étape, ou un élément de structure. {@code type} dit lequel ; seuls les champs de ce type comptent.
     *
     * @param answeredBy qui répond de l'étape : {@code person:<id>}, {@code role:owner}, {@code role:admin} ou
     *                   {@code project-lead}, comme ceux qui accordent une règle
     * @param terminate  pour une fin du processus : elle arrête tout le processus
     * @param attachedTo pour une échéance ou un chemin d'échec : l'étape qu'il surveille
     * @param duration   pour une échéance : sa durée, en ISO 8601 ({@code P2D})
     * @param waitFor    pour une attente : ce qu'elle attend ({@code wait} en JSON ; {@code wait()} est à Object)
     * @param issue      l'issue que l'étape porte, par sa clé ({@code WEB-12})
     * @param steps      pour une étape de haut niveau ou une zone d'agent : ce qu'elle tient
     * @param flows      pour une étape de haut niveau : ses chemins
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    @Schema(name = "ProcessStep")
    public record Step(
        String id,
        String type,
        String name,
        String description,
        String answeredBy,
        Lock lock,
        Boolean terminate,
        String attachedTo,
        String duration,
        AgentSettings agent,
        HumanTask human,
        @JsonProperty("wait") WaitFor waitFor,
        List<RuleRef> rules,
        List<String> documents,
        String issue,
        List<Step> steps,
        List<Flow> flows) {

        public Step {
            id = clean(id);
            type = clean(type);
            name = line(name);
            description = clean(description);
            answeredBy = clean(answeredBy);
            terminate = cleanFlag(terminate);
            attachedTo = clean(attachedTo);
            duration = clean(duration);
            rules = cleanList(rules);
            documents = cleanLines(documents);
            issue = clean(issue);
            steps = cleanList(steps);
            flows = cleanList(flows);
        }

        /** Vrai pour une étape d'un des cinq types. */
        public boolean workStep() {
            return type != null && STEP_TYPES.contains(type);
        }

        /** Vrai pour un conteneur : une étape de haut niveau ou une zone d'agent. */
        public boolean container() {
            return STAGE.equals(type) || ZONE.equals(type);
        }

        /** Vrai pour une échéance ou un chemin d'échec, accrochés à une étape. */
        public boolean boundary() {
            return DEADLINE.equals(type) || FAILURE.equals(type);
        }

        /** Le point de pause que l'étape tient, ou null. */
        public String pausePoint() {
            return lock != null && LOCK_PAUSE_POINT.equals(lock.by()) ? lock.ref() : null;
        }

        /** Le nom de l'étape pour une phrase : son nom, sinon son identifiant. */
        public String label() {
            return name != null ? name : Objects.toString(id, "");
        }

        public List<Step> stepsOrEmpty() {
            return steps == null ? List.of() : steps;
        }

        public List<Flow> flowsOrEmpty() {
            return flows == null ? List.of() : flows;
        }
    }

    /**
     * Un chemin d'une étape à une autre, dans le même conteneur. À la sortie d'une décision, un chemin porte sa
     * condition, ou il est celui de tous les autres cas ({@code otherwise}).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    @Schema(name = "ProcessFlow")
    public record Flow(String id, String from, String to, String name, Boolean otherwise, Condition condition) {

        public Flow {
            id = clean(id);
            from = clean(from);
            to = clean(to);
            name = line(name);
            otherwise = cleanFlag(otherwise);
        }

        public boolean otherwiseFlow() {
            return Boolean.TRUE.equals(otherwise);
        }
    }

    /**
     * La condition d'un chemin : une règle en mots ({@code text}, ce que les personnes lisent), et ce qu'elle juge,
     * compilé, que du code décide sans modèle : l'issue ({@code outcome}) d'une étape qui la précède ({@code step}).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    @Schema(name = "ProcessCondition")
    public record Condition(String text, String step, String outcome) {

        public Condition {
            text = line(text);
            step = clean(step);
            outcome = clean(outcome);
        }

        /** Vrai quand la condition n'a que ses mots : rien que du code puisse juger. */
        public boolean wordsOnly() {
            return step == null || outcome == null;
        }
    }

    /** Le verrou d'une étape et sa source : le socle, une règle, l'auteur du workflow, un point de pause. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    @Schema(name = "ProcessLock")
    public record Lock(String by, String ref) {

        public Lock {
            by = clean(by);
            ref = clean(ref);
        }
    }

    /**
     * Les réglages d'une étape d'agent : l'agent ({@code provider}, la clé d'un fournisseur comme {@code claude-code},
     * ou {@code cortex}), son modèle (nul : celui de l'espace), les outils de l'entreprise qu'il peut prendre, ses
     * tentatives (trois au plus, puis l'incident, ADR-023) et son délai en ISO 8601.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    @Schema(name = "ProcessAgentSettings")
    public record AgentSettings(String provider, String model, List<String> tools, Integer attempts, String timeout) {

        public AgentSettings {
            provider = clean(provider);
            model = clean(model);
            tools = cleanStrings(tools);
            timeout = clean(timeout);
        }
    }

    /**
     * Une tâche humaine : qui la fait (une personne ou un rôle), la question, sa sorte (un accord, une saisie typée, une
     * liste de contrôle de moins de dix lignes) et ce que signifie la signature (revue, approbation, responsabilité,
     * rédaction).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    @Schema(name = "ProcessHumanTask")
    public record HumanTask(String who, String question, String kind, String meaning, List<String> checklist,
                            List<Field> fields) {

        public HumanTask {
            who = clean(who);
            question = line(question);
            kind = clean(kind);
            meaning = clean(meaning);
            checklist = cleanLines(checklist);
            fields = cleanList(fields);
        }
    }

    /** Un champ typé d'une saisie : texte, nombre, date, choix, personne ou document. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    @Schema(name = "ProcessField")
    public record Field(String id, String label, String type, List<String> choices) {

        public static final List<String> TYPES = List.of("text", "number", "date", "choice", "person", "document");

        public Field {
            id = clean(id);
            label = line(label);
            type = clean(type);
            choices = cleanLines(choices);
        }
    }

    /**
     * Ce qu'attend une attente : une durée ({@code timer}), ou un message ({@code message}) : ce qui est attendu, en
     * mots, et qui doit le fournir.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    @Schema(name = "ProcessWaitFor")
    public record WaitFor(String kind, String duration, String what, String from) {

        public WaitFor {
            kind = clean(kind);
            duration = clean(duration);
            what = line(what);
            from = clean(from);
        }
    }

    /** Une règle qui s'applique à l'étape, par son identifiant, et la version de sa couche quand elle est connue. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    @Schema(name = "ProcessRuleRef")
    public record RuleRef(String ref, Integer version) {

        public RuleRef {
            ref = clean(ref);
        }
    }

    public List<Step> stepsOrEmpty() {
        return steps == null ? List.of() : steps;
    }

    public List<Flow> flowsOrEmpty() {
        return flows == null ? List.of() : flows;
    }

    /** Toutes les étapes, à tous les niveaux, dans l'ordre du modèle. */
    public List<Step> allSteps() {
        List<Step> out = new ArrayList<>();
        collect(stepsOrEmpty(), out);
        return out;
    }

    private static void collect(List<Step> steps, List<Step> out) {
        for (Step step : steps) {
            out.add(step);
            collect(step.stepsOrEmpty(), out);
        }
    }

    // ------------------------------------------------------------------------------------------------- normaliser

    static String clean(String value) {
        if (value == null) {
            return null;
        }
        String stripped = value.strip();
        return stripped.isEmpty() ? null : stripped;
    }

    static Boolean cleanFlag(Boolean value) {
        return Boolean.TRUE.equals(value) ? Boolean.TRUE : null;
    }

    static <T> List<T> cleanList(List<T> values) {
        if (values == null) {
            return null;
        }
        List<T> out = values.stream().filter(Objects::nonNull).toList();
        return out.isEmpty() ? null : out;
    }

    static List<String> cleanStrings(List<String> values) {
        if (values == null) {
            return null;
        }
        List<String> out = values.stream().map(ProcessModel::clean).filter(Objects::nonNull).toList();
        return out.isEmpty() ? null : out;
    }

    /**
     * Un texte d'une ligne (un nom, une question, une ligne de liste) : ses blancs se réduisent à une espace. Un fichier
     * XML change de toute façon un saut de ligne en espace dans un attribut ; le modèle le fait d'avance, et l'aller et
     * retour garde l'empreinte.
     */
    static String line(String value) {
        String cleaned = clean(value);
        return cleaned == null ? null : cleaned.replaceAll("\\s+", " ");
    }

    static List<String> cleanLines(List<String> values) {
        if (values == null) {
            return null;
        }
        List<String> out = values.stream().map(ProcessModel::line).filter(Objects::nonNull).toList();
        return out.isEmpty() ? null : out;
    }
}
