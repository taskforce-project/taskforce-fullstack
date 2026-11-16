package com.taskforce.tf_api.core.process;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.Schema;
import javax.xml.validation.SchemaFactory;
import javax.xml.validation.Validator;

import org.w3c.dom.Attr;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;
import org.xml.sax.ErrorHandler;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;

import com.taskforce.tf_api.core.process.ProcessModel.AgentSettings;
import com.taskforce.tf_api.core.process.ProcessModel.Condition;
import com.taskforce.tf_api.core.process.ProcessModel.Field;
import com.taskforce.tf_api.core.process.ProcessModel.Flow;
import com.taskforce.tf_api.core.process.ProcessModel.HumanTask;
import com.taskforce.tf_api.core.process.ProcessModel.Lock;
import com.taskforce.tf_api.core.process.ProcessModel.RuleRef;
import com.taskforce.tf_api.core.process.ProcessModel.Step;
import com.taskforce.tf_api.core.process.ProcessModel.WaitFor;
import com.taskforce.tf_api.core.process.ProcessValidator.Foreign;

/**
 * L'import d'un fichier BPMN 2.0 dans notre modèle (ADR-027). Il lit le sous-ensemble ({@link ProcessSubset}) et
 * l'extension {@code tf:} ; ce qui est hors du sous-ensemble ne devient pas une étape, il revient dans la liste
 * {@link Result#foreign()}, que le vérificateur dit en phrases. Chaque élément lu n'a que les attributs et les enfants
 * que le sous-ensemble lui connaît, avec les valeurs qui gardent son sens ; le reste est refusé, jamais laissé de côté
 * en silence. Les éléments {@code tf:} suivent leur schéma ({@code contracts/process/taskforce-process-1.xsd}), et une
 * condition est en mots, jamais dans la langue d'un autre moteur. Le dessin (BPMN DI) est ignoré : il n'est pas le
 * processus. Ce qui n'est ni du processus ni de TaskForce (les réglages d'un autre outil, des notes dessinées) est
 * laissé de côté, et {@link Result#notes()} le dit.
 *
 * <p>Le fichier vient de dehors : le lecteur refuse les DTD et les entités externes (XXE), ne suit aucune adresse et
 * ne charge rien d'autre que le texte donné.</p>
 */
public final class BpmnImport {

    /** Le plus grand fichier qu'on lit : un processus de la taille permise y tient largement. */
    public static final int MAX_CHARS = 1_000_000;

    /**
     * La plus grande profondeur d'éléments qu'on lit : un processus en tient une dizaine (le fichier, le processus, une
     * phase, une zone, une étape, ses extensions et leurs réglages). Au-delà, le lecteur s'arrête avant de descendre.
     */
    public static final int MAX_DEPTH = 64;

    /** La propriété de JAXP qui borne la profondeur ; son nom revient dans l'erreur du lecteur, quelle que soit sa langue. */
    private static final String MAX_ELEMENT_DEPTH = "http://www.oracle.com/xml/jaxp/properties/maxElementDepth";

    /** L'extension tf:, telle que le contrat l'écrit ; une copie est dans le serveur, un test vérifie qu'elle est la même. */
    private static final Schema TF_SCHEMA = tfSchema();

    /**
     * Les erreurs du schéma de tf: qui ne portent que sur une valeur (un motif, une liste, une borne, un type) : la
     * valeur entre dans le modèle, où le vérificateur la juge en phrases. Les autres disent un élément ou un attribut
     * que l'extension n'a pas, ou mal placé.
     */
    private static final List<String> VALUE_ERRORS = List.of("cvc-pattern-valid", "cvc-enumeration-valid",
        "cvc-datatype-valid", "cvc-minInclusive-valid", "cvc-maxInclusive-valid", "cvc-minExclusive-valid",
        "cvc-maxExclusive-valid", "cvc-minLength-valid", "cvc-maxLength-valid", "cvc-length-valid",
        "cvc-totalDigits-valid", "cvc-fractionDigits-valid", "cvc-attribute.3", "cvc-type.3.1.3");

    private BpmnImport() {
    }

    /** Ce que le fichier donne : le modèle, ce qui est hors du sous-ensemble, et ce qui a été laissé de côté. */
    public record Result(ProcessModel model, List<Foreign> foreign, List<String> notes) {
    }

    /** Un fichier qui n'est pas un processus BPMN 2.0 lisible ; le message le dit en mots. */
    public static final class Unreadable extends RuntimeException {
        public Unreadable(String message) {
            super(message);
        }
    }

    public static Result read(String xml) {
        if (xml == null || xml.isBlank()) {
            throw new Unreadable("The file is empty.");
        }
        if (xml.length() > MAX_CHARS) {
            throw new Unreadable("The file is too large to be one process: split it.");
        }
        return new Reader(parse(xml)).read();
    }

    static Document parse(String xml) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            factory.setAttribute(MAX_ELEMENT_DEPTH, MAX_DEPTH);
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            DocumentBuilder builder = factory.newDocumentBuilder();
            builder.setErrorHandler(new ErrorHandler() {
                @Override
                public void warning(SAXParseException e) {
                    // Un avertissement du lecteur ne dit rien du processus.
                }

                @Override
                public void error(SAXParseException e) throws SAXException {
                    throw e;
                }

                @Override
                public void fatalError(SAXParseException e) throws SAXException {
                    throw e;
                }
            });
            return builder.parse(new InputSource(new StringReader(xml)));
        } catch (SAXParseException e) {
            if (Objects.toString(e.getMessage(), "").contains("maxElementDepth")) {
                throw new Unreadable("The file nests its parts more than " + MAX_DEPTH + " levels deep: a process is "
                    + "never that deep.");
            }
            throw new Unreadable("The file isn't well-formed XML (line " + e.getLineNumber() + ").");
        } catch (SAXException | IOException e) {
            throw new Unreadable("The file isn't well-formed XML.");
        } catch (ParserConfigurationException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Schema tfSchema() {
        try (InputStream in = BpmnImport.class.getResourceAsStream("/process/taskforce-process-1.xsd")) {
            if (in == null) {
                throw new IllegalStateException("The schema of the tf: extension is missing from the server.");
            }
            SchemaFactory factory = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            return factory.newSchema(new StreamSource(in));
        } catch (IOException | SAXException e) {
            throw new IllegalStateException("The schema of the tf: extension can't be read.", e);
        }
    }

    // ------------------------------------------------------------------------------------------------- ce qu'on lit

    /**
     * Ce qu'un élément du sous-ensemble porte : ses attributs, avec les valeurs qui gardent son sens (aucune liste :
     * toute valeur), ses enfants (null : son lecteur les lit lui-même), s'il porte des définitions d'événement (que son
     * lecteur juge), et l'élément tf: qu'il porte dans ses extensions (null : aucun).
     */
    private record Shape(Map<String, Set<String>> attributes, Set<String> children, boolean events, String tf) {
    }

    private static final Set<String> ANY = Set.of();
    private static final Set<String> ONE = Set.of("1");
    private static final Set<String> NO = Set.of("false");
    private static final Set<String> IMPLEMENTATION = Set.of("##unspecified", "##WebService");
    private static final Set<String> NODE = Set.of("documentation", "extensionElements", "incoming", "outgoing");
    /**
     * Ce que lit le lecteur d'une tâche, pour le refuser avec sa raison ou le dire : les données, les boucles, les
     * personnes qu'un fichier nomme.
     */
    private static final Set<String> TASK = Set.of("documentation", "extensionElements", "incoming", "outgoing",
        "ioSpecification", "property", "dataInputAssociation", "dataOutputAssociation", "resourceRole", "performer",
        "humanPerformer", "potentialOwner", "multiInstanceLoopCharacteristics", "standardLoopCharacteristics");
    private static final Set<String> BASE = Set.of("documentation", "extensionElements");

    private static final Map<String, Shape> SHAPES = new HashMap<>();

    static {
        Map<String, Set<String>> activity = Map.of("id", ANY, "name", ANY, "isForCompensation", ANY, "startQuantity", ONE,
            "completionQuantity", ONE);
        SHAPES.put("process", new Shape(Map.of("id", ANY, "name", ANY, "isExecutable", ANY, "processType", ANY,
            "isClosed", ANY), null, false, "process"));
        SHAPES.put("subProcess", new Shape(with(activity, "triggeredByEvent", ANY), null, false, "step"));
        SHAPES.put("adHocSubProcess", new Shape(with(with(activity, "ordering", Set.of("Parallel")),
            "cancelRemainingInstances", ANY), null, false, "step"));
        SHAPES.put("userTask", new Shape(with(activity, "implementation", IMPLEMENTATION), TASK, false, "step"));
        SHAPES.put("serviceTask", new Shape(with(activity, "implementation", IMPLEMENTATION), TASK, false, "step"));
        SHAPES.put("startEvent", new Shape(Map.of("id", ANY, "name", ANY, "isInterrupting", Set.of("true"),
            "parallelMultiple", NO), NODE, true, "step"));
        SHAPES.put("endEvent", new Shape(Map.of("id", ANY, "name", ANY), NODE, true, "step"));
        SHAPES.put("intermediateCatchEvent", new Shape(Map.of("id", ANY, "name", ANY, "parallelMultiple", NO), NODE,
            true, "step"));
        SHAPES.put("boundaryEvent", new Shape(Map.of("id", ANY, "name", ANY, "attachedToRef", ANY, "cancelActivity",
            ANY, "parallelMultiple", NO), NODE, true, "step"));
        SHAPES.put("exclusiveGateway", new Shape(Map.of("id", ANY, "name", ANY, "default", ANY, "gatewayDirection",
            ANY), NODE, false, "step"));
        SHAPES.put("parallelGateway", new Shape(Map.of("id", ANY, "name", ANY, "gatewayDirection", ANY), NODE, false,
            "step"));
        SHAPES.put("sequenceFlow", new Shape(Map.of("id", ANY, "name", ANY, "sourceRef", ANY, "targetRef", ANY),
            Set.of("documentation", "extensionElements", "conditionExpression"), false, "condition"));
        SHAPES.put("conditionExpression", new Shape(Map.of("id", ANY, "language", ANY, "evaluatesToTypeRef", ANY),
            Set.of(), false, null));
        SHAPES.put("timerEventDefinition", new Shape(Map.of("id", ANY), Set.of("documentation", "extensionElements",
            "timeDuration", "timeDate", "timeCycle"), false, null));
        SHAPES.put("timeDuration", new Shape(Map.of("id", ANY, "evaluatesToTypeRef", ANY), Set.of(), false, null));
        SHAPES.put("messageEventDefinition", new Shape(Map.of("id", ANY, "messageRef", ANY), BASE, false, null));
        SHAPES.put("errorEventDefinition", new Shape(Map.of("id", ANY), BASE, false, null));
        SHAPES.put("terminateEventDefinition", new Shape(Map.of("id", ANY), BASE, false, null));
        SHAPES.put("message", new Shape(Map.of("id", ANY, "name", ANY), BASE, false, null));
    }

    private static Map<String, Set<String>> with(Map<String, Set<String>> attributes, String name, Set<String> values) {
        Map<String, Set<String>> out = new HashMap<>(attributes);
        out.put(name, values);
        return Map.copyOf(out);
    }

    /** Les enfants refusés qui ont leur raison dans {@link ProcessSubset} : les autres se disent par leur nom. */
    private static final Map<String, String> REFUSED_CHILDREN = Map.ofEntries(
        Map.entry("dataInput", "dataObject"), Map.entry("dataOutput", "dataObject"),
        Map.entry("dataInputAssociation", "dataObject"), Map.entry("dataOutputAssociation", "dataObject"),
        Map.entry("inputSet", "dataObject"), Map.entry("outputSet", "dataObject"), Map.entry("property", "dataObject"),
        Map.entry("ioSpecification", "dataObject"), Map.entry("rendering", "rendering"),
        Map.entry("completionCondition", "completionCondition"), Map.entry("operationRef", "service"),
        Map.entry("ioBinding", "service"), Map.entry("supportedInterfaceRef", "service"),
        Map.entry("standardLoopCharacteristics", "loop"),
        Map.entry("multiInstanceLoopCharacteristics", "multiInstance"));

    // ------------------------------------------------------------------------------------------------- lire

    private static final class Reader {

        private final Document doc;
        private final List<Foreign> foreign = new ArrayList<>();
        private final Set<String> notes = new LinkedHashSet<>();
        private final Map<String, String> messages = new HashMap<>();
        private final Validator tfValidator;
        /** La langue des expressions que le fichier déclare pour lui tout entier, ou null. */
        private String expressionLanguage;

        Reader(Document doc) {
            this.doc = doc;
            this.tfValidator = TF_SCHEMA.newValidator();
            try {
                tfValidator.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
                tfValidator.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            } catch (SAXException e) {
                throw new IllegalStateException(e);
            }
        }

        Result read() {
            Element root = doc.getDocumentElement();
            if (!Bpmn.MODEL.equals(root.getNamespaceURI()) || !"definitions".equals(root.getLocalName())) {
                throw new Unreadable("This file isn't a BPMN 2.0 file: it has no definitions.");
            }
            expressionLanguage = attr(root, "expressionLanguage");
            List<Element> processes = new ArrayList<>();
            for (Element child : children(root)) {
                if (Bpmn.BPMNDI.equals(child.getNamespaceURI())) {
                    continue;
                }
                if (!Bpmn.MODEL.equals(child.getNamespaceURI())) {
                    notes.add("Something other than the process was left out (" + child.getTagName() + ").");
                    continue;
                }
                switch (child.getLocalName()) {
                    case "process" -> processes.add(child);
                    case "message" -> {
                        inspect(child, "message", attr(child, "id"), attr(child, "name"));
                        messages.put(child.getAttribute("id"), attr(child, "name"));
                    }
                    case "error", "documentation", "extensionElements" -> { }
                    case "category", "import", "relationship" -> notes.add("Parts of the file that aren't the process "
                        + "were left out (" + child.getLocalName() + ").");
                    case "collaboration" -> foreign.add(new Foreign("collaboration", attr(child, "id"), null));
                    case "signal" -> foreign.add(new Foreign("signal", attr(child, "id"), attr(child, "name")));
                    case "escalation" -> foreign.add(new Foreign("escalation", attr(child, "id"), attr(child, "name")));
                    case "dataStore" -> foreign.add(new Foreign("dataObject", attr(child, "id"), attr(child, "name")));
                    default -> foreign.add(new Foreign(child.getLocalName(), attr(child, "id"), attr(child, "name")));
                }
            }
            if (processes.isEmpty()) {
                throw new Unreadable("This file holds no process.");
            }
            if (processes.size() > 1) {
                foreign.add(new Foreign("severalProcesses", null, null));
            }
            Element process = processes.get(0);
            inspect(process, "process", attr(process, "id"), attr(process, "name"));
            Element tf = tf(process, "process");
            List<Step> steps = new ArrayList<>();
            List<Flow> flows = new ArrayList<>();
            container(process, steps, flows);
            ProcessModel model = new ProcessModel(tf == null || attr(tf, "format") == null ? ProcessModel.FORMAT
                : attr(tf, "format"), attr(process, "id"), attr(process, "name"), documentation(process),
                tf == null ? null : attr(tf, "derivedFrom"), steps, flows);
            return new Result(model, List.copyOf(foreign), List.copyOf(notes));
        }

        /** Le contenu d'un processus ou d'un sous-processus : ses étapes et ses chemins. */
        private void container(Element owner, List<Step> steps, List<Flow> flows) {
            Map<String, String> defaults = new HashMap<>();
            for (Element e : children(owner)) {
                if (Bpmn.TF.equals(e.getNamespaceURI())) {
                    foreign.add(new Foreign("tfSettings", attr(owner, "id"), attr(owner, "name"), "tf:"
                        + e.getLocalName() + ", outside its extensions"));
                    continue;
                }
                if (!Bpmn.MODEL.equals(e.getNamespaceURI())) {
                    notes.add("Something other than the process was left out (" + e.getTagName() + ").");
                    continue;
                }
                String local = e.getLocalName();
                switch (local) {
                    case "documentation", "extensionElements", "incoming", "outgoing" -> { }
                    case "auditing", "monitoring" -> notes.add(settings(local));
                    case "categoryValueRef" -> notes.add(DRAWING);
                    case "completionCondition", "ioBinding", "supportedInterfaceRef" ->
                        foreign.add(new Foreign(REFUSED_CHILDREN.get(local), attr(owner, "id"), attr(owner, "name")));
                    case "laneSet" -> foreign.add(new Foreign("lanes", attr(e, "id"), null));
                    case "sequenceFlow" -> flows.add(flow(e));
                    case "textAnnotation", "association", "group" -> notes.add(DRAWING);
                    case "dataObject", "dataObjectReference", "dataStoreReference", "property", "ioSpecification",
                         "dataInputAssociation", "dataOutputAssociation" ->
                        foreign.add(new Foreign("dataObject", attr(e, "id"), attr(e, "name")));
                    case "exclusiveGateway" -> {
                        if (attr(e, "default") != null) {
                            defaults.put(attr(e, "default"), attr(e, "id"));
                        }
                        add(steps, node(e, ProcessModel.DECISION));
                    }
                    default -> add(steps, element(e, local));
                }
            }
            if (!defaults.isEmpty()) {
                flows.replaceAll(f -> defaults.containsKey(f.id())
                    ? new Flow(f.id(), f.from(), f.to(), f.name(), Boolean.TRUE, f.condition()) : f);
            }
        }

        private static void add(List<Step> steps, Step step) {
            if (step != null) {
                steps.add(step);
            }
        }

        /** Un élément de flux ; null quand il est hors du sous-ensemble (il est alors dans {@link #foreign}). */
        private Step element(Element e, String local) {
            return switch (local) {
                case "startEvent" -> definitions(e).isEmpty() ? node(e, ProcessModel.START)
                    : refuse("startTrigger", e);
                case "endEvent" -> end(e);
                case "intermediateCatchEvent" -> waitEvent(e);
                case "boundaryEvent" -> boundary(e);
                case "intermediateThrowEvent" -> refuse(throwKind(e), e);
                case "userTask" -> activity(e, ProcessModel.HUMAN);
                case "serviceTask" -> activity(e, ProcessModel.AGENT);
                case "subProcess" -> "true".equals(attr(e, "triggeredByEvent")) ? refuse("eventSubProcess", e)
                    : activity(e, ProcessModel.STAGE);
                case "adHocSubProcess" -> activity(e, ProcessModel.ZONE);
                case "parallelGateway" -> node(e, ProcessModel.PARALLEL);
                case "inclusiveGateway", "complexGateway", "eventBasedGateway", "transaction", "callActivity", "task",
                     "manualTask", "sendTask", "receiveTask", "scriptTask", "businessRuleTask" -> refuse(local, e);
                default -> refuse(local, e);
            };
        }

        private Step refuse(String element, Element e) {
            foreign.add(new Foreign(element, attr(e, "id"), attr(e, "name")));
            return null;
        }

        private Step end(Element e) {
            List<Element> defs = definitions(e);
            if (defs.isEmpty()) {
                return node(e, ProcessModel.END);
            }
            if (defs.size() == 1 && "terminateEventDefinition".equals(defs.get(0).getLocalName())) {
                Step plain = node(e, ProcessModel.END);
                inspect(defs.get(0), "terminateEventDefinition", attr(e, "id"), attr(e, "name"));
                return copy(plain, Boolean.TRUE, null, null, null);
            }
            if (defs.stream().anyMatch(d -> "cancelEventDefinition".equals(d.getLocalName()))) {
                return refuse("cancel", e);
            }
            return refuse("endTrigger", e);
        }

        private Step waitEvent(Element e) {
            List<Element> defs = definitions(e);
            Step plain = node(e, ProcessModel.WAIT);
            if (defs.isEmpty()) {
                return plain;
            }
            if (defs.size() > 1) {
                return refuse("eventBasedGateway", e);
            }
            Element def = defs.get(0);
            Element tf = tf(e, "step");
            String from = tf == null ? null : attrOf(tf, "wait", "from");
            switch (def.getLocalName()) {
                case "timerEventDefinition" -> {
                    String kind = timerKind(def);
                    if (kind != null) {
                        return refuse(kind, e);
                    }
                    return withWait(plain, new WaitFor(ProcessModel.TIMER, duration(e, def), null, from));
                }
                case "messageEventDefinition" -> {
                    inspect(def, "messageEventDefinition", attr(e, "id"), attr(e, "name"));
                    String ref = local(attr(def, "messageRef"));
                    return withWait(plain, new WaitFor(ProcessModel.MESSAGE, null, ref == null ? null : messages.get(ref),
                        from));
                }
                case "signalEventDefinition" -> {
                    return refuse("signal", e);
                }
                case "conditionalEventDefinition" -> {
                    return refuse("conditionalEvent", e);
                }
                case "linkEventDefinition" -> {
                    return refuse("link", e);
                }
                default -> {
                    return refuse(def.getLocalName(), e);
                }
            }
        }

        private Step boundary(Element e) {
            List<Element> defs = definitions(e);
            String host = local(attr(e, "attachedToRef"));
            if (defs.size() != 1) {
                return refuse("boundaryTrigger", e);
            }
            Element def = defs.get(0);
            switch (def.getLocalName()) {
                case "timerEventDefinition" -> {
                    if ("false".equals(attr(e, "cancelActivity"))) {
                        return refuse("nonInterruptingDeadline", e);
                    }
                    String kind = timerKind(def);
                    if (kind != null) {
                        return refuse(kind, e);
                    }
                    return copy(node(e, ProcessModel.DEADLINE), null, host, duration(e, def), null);
                }
                case "errorEventDefinition" -> {
                    if ("false".equals(attr(e, "cancelActivity"))) {
                        // Un échec arrête toujours son étape : une bordure d'erreur qui la laisse aller n'existe pas.
                        foreign.add(new Foreign("setting", attr(e, "id"), attr(e, "name"), "cancelActivity=\"false\""));
                    }
                    inspect(def, "errorEventDefinition", attr(e, "id"), attr(e, "name"));
                    return copy(node(e, ProcessModel.FAILURE), null, host, null, null);
                }
                case "compensateEventDefinition" -> {
                    return refuse("compensation", e);
                }
                case "escalationEventDefinition" -> {
                    return refuse("escalation", e);
                }
                case "signalEventDefinition" -> {
                    return refuse("signal", e);
                }
                case "cancelEventDefinition" -> {
                    return refuse("cancel", e);
                }
                default -> {
                    return refuse("boundaryTrigger", e);
                }
            }
        }

        /** La durée d'une minuterie : sa définition et son {@code timeDuration} n'ont que ce que le sous-ensemble connaît. */
        private String duration(Element owner, Element timer) {
            inspect(timer, "timerEventDefinition", attr(owner, "id"), attr(owner, "name"));
            Element value = child(timer, "timeDuration");
            if (value == null) {
                return null;
            }
            inspect(value, "timeDuration", attr(owner, "id"), attr(owner, "name"));
            return text(value);
        }

        private String throwKind(Element e) {
            for (Element def : definitions(e)) {
                switch (def.getLocalName()) {
                    case "linkEventDefinition" -> { return "link"; }
                    case "signalEventDefinition" -> { return "signal"; }
                    case "escalationEventDefinition" -> { return "escalation"; }
                    case "compensateEventDefinition" -> { return "compensation"; }
                    default -> { }
                }
            }
            return "intermediateThrowEvent";
        }

        /** Le genre d'une minuterie qui n'est pas une durée, ou null pour une durée. */
        private String timerKind(Element def) {
            if (child(def, "timeDate") != null) {
                return "timerDate";
            }
            if (child(def, "timeCycle") != null) {
                return "timerCycle";
            }
            return null;
        }

        /** Une tâche ou un sous-processus : ce qui le fait sortir du sous-ensemble, puis son contenu. */
        private Step activity(Element e, String type) {
            if (child(e, "multiInstanceLoopCharacteristics") != null) {
                return refuse("multiInstance", e);
            }
            if (child(e, "standardLoopCharacteristics") != null) {
                return refuse("loop", e);
            }
            if ("true".equals(attr(e, "isForCompensation"))) {
                return refuse("compensation", e);
            }
            for (Element c : children(e)) {
                if (!Bpmn.MODEL.equals(c.getNamespaceURI())) {
                    continue;
                }
                switch (c.getLocalName()) {
                    case "ioSpecification", "property", "dataInputAssociation", "dataOutputAssociation" -> {
                        return refuse("dataObject", e);
                    }
                    case "resourceRole", "performer", "humanPerformer", "potentialOwner" -> notes.add("Who does a task "
                        + "comes from TaskForce's own settings: the people the file names were left out.");
                    default -> { }
                }
            }
            Step plain = node(e, type);
            if (plain == null || !(ProcessModel.STAGE.equals(type) || ProcessModel.ZONE.equals(type))) {
                return plain;
            }
            List<Step> steps = new ArrayList<>();
            List<Flow> flows = new ArrayList<>();
            container(e, steps, flows);
            return new Step(plain.id(), plain.type(), plain.name(), plain.description(), plain.answeredBy(), plain.lock(),
                plain.terminate(), plain.attachedTo(), plain.duration(), plain.agent(), plain.human(), plain.waitFor(),
                plain.rules(), plain.documents(), plain.issue(), steps, flows);
        }

        /** Une étape et ce que {@code tf:step} dit d'elle ; l'élément n'a que ce que le sous-ensemble lui connaît. */
        private Step node(Element e, String type) {
            inspect(e, e.getLocalName(), attr(e, "id"), attr(e, "name"));
            Element tf = tf(e, "step");
            if (tf == null) {
                return new Step(attr(e, "id"), type, attr(e, "name"), documentation(e), null, null, null, null, null,
                    null, null, null, null, null, null, null, null);
            }
            Lock lock = attr(tf, "lock") == null && attr(tf, "lockRef") == null ? null
                : new Lock(attr(tf, "lock"), attr(tf, "lockRef"));
            AgentSettings agent = null;
            Element a = tfChild(tf, "agent");
            if (a != null) {
                List<String> tools = tfChildren(a, "tool").stream().map(t -> attr(t, "name")).toList();
                agent = new AgentSettings(attr(a, "provider"), attr(a, "model"), tools, integer(attr(a, "attempts")),
                    attr(a, "timeout"));
            }
            HumanTask human = null;
            Element h = tfChild(tf, "human");
            if (h != null) {
                List<String> checklist = tfChildren(h, "item").stream().map(i -> attr(i, "text")).toList();
                List<Field> fields = tfChildren(h, "field").stream()
                    .map(f -> new Field(attr(f, "id"), attr(f, "label"), attr(f, "type"),
                        tfChildren(f, "choice").stream().map(c -> attr(c, "value")).toList()))
                    .toList();
                human = new HumanTask(attr(h, "who"), attr(h, "question"), attr(h, "kind"), attr(h, "meaning"),
                    checklist, fields, attr(h, "prefill"));
            }
            List<RuleRef> rules = tfChildren(tf, "rule").stream()
                .map(r -> new RuleRef(attr(r, "ref"), integer(attr(r, "version")))).toList();
            List<String> documents = tfChildren(tf, "document").stream().map(d -> attr(d, "name")).toList();
            return new Step(attr(e, "id"), type, attr(e, "name"), documentation(e), attr(tf, "answeredBy"), lock, null,
                null, null, agent, human, null, rules, documents, attr(tf, "issue"), null, null);
        }

        private static Step copy(Step s, Boolean terminate, String attachedTo, String duration, WaitFor wait) {
            if (s == null) {
                return null;
            }
            return new Step(s.id(), s.type(), s.name(), s.description(), s.answeredBy(), s.lock(),
                terminate != null ? terminate : s.terminate(), attachedTo != null ? attachedTo : s.attachedTo(),
                duration != null ? duration : s.duration(), s.agent(), s.human(), wait != null ? wait : s.waitFor(),
                s.rules(), s.documents(), s.issue(), s.steps(), s.flows());
        }

        private static Step withWait(Step s, WaitFor wait) {
            return copy(s, null, null, null, wait);
        }

        private Flow flow(Element e) {
            String id = attr(e, "id");
            String label = attr(e, "name") != null ? attr(e, "name") : id;
            inspect(e, "sequenceFlow", id, label);
            Element expression = child(e, "conditionExpression");
            Element tf = tf(e, "condition");
            if (expression != null) {
                inspect(expression, "conditionExpression", id, label);
                // Une condition est en mots (ADR-027, point 11) : la langue d'un autre moteur n'est pas la nôtre. Avec ce
                // que du code juge (tf:condition), ses mots sont dans la langue des conditions de TaskForce, dite : sans
                // elle, l'expression d'un autre moteur (${...}, =x = true) deviendrait les mots qu'on lit.
                String language = attr(expression, "language") != null ? attr(expression, "language")
                    : expressionLanguage;
                if (language != null && !Bpmn.CONDITION_LANGUAGE.equals(language.strip())) {
                    foreign.add(new Foreign("conditionLanguage", id, label, language.strip()));
                } else if (language == null && tf != null) {
                    foreign.add(new Foreign("conditionNoLanguage", id, label));
                }
            }
            Condition condition = expression == null && tf == null ? null
                : new Condition(expression == null ? null : text(expression), tf == null ? null : attr(tf, "step"),
                    tf == null ? null : attr(tf, "outcome"));
            return new Flow(id, attr(e, "sourceRef"), attr(e, "targetRef"), attr(e, "name"), null, condition);
        }

        // --------------------------------------------------------------------------------------------- ce qu'il porte

        /**
         * Un élément n'a que les attributs et les enfants que le sous-ensemble lui connaît, avec les valeurs qui gardent
         * son sens ; le reste est refusé. Un attribut d'un autre outil est un de ses réglages : laissé de côté, et dit.
         */
        private void inspect(Element e, String kind, String id, String name) {
            Shape shape = SHAPES.get(kind);
            if (shape == null) {
                return;
            }
            NamedNodeMap attributes = e.getAttributes();
            for (int i = 0; i < attributes.getLength(); i++) {
                Attr a = (Attr) attributes.item(i);
                String ns = a.getNamespaceURI();
                if (XMLConstants.XMLNS_ATTRIBUTE_NS_URI.equals(ns) || Bpmn.XSI.equals(ns)) {
                    continue;
                }
                if (ns != null && !ns.isEmpty()) {
                    notes.add(settings(ns));
                    continue;
                }
                String local = a.getLocalName() != null ? a.getLocalName() : a.getName();
                Set<String> values = shape.attributes().get(local);
                if (values == null || (!values.isEmpty() && !values.contains(a.getValue().strip()))) {
                    foreign.add(new Foreign("setting", id, name, local + "=\"" + a.getValue() + "\""));
                }
            }
            if (shape.children() != null) {
                for (Element c : children(e)) {
                    String local = c.getLocalName();
                    if (Bpmn.MODEL.equals(c.getNamespaceURI())) {
                        boolean read = shape.children().contains(local) || (shape.events()
                            && (local.endsWith("EventDefinition") || "eventDefinitionRef".equals(local)));
                        if ("auditing".equals(local) || "monitoring".equals(local)) {
                            notes.add(settings(local));
                        } else if ("categoryValueRef".equals(local)) {
                            notes.add(DRAWING);
                        } else if (!read) {
                            foreign.add(new Foreign(REFUSED_CHILDREN.getOrDefault(local, local), id, name));
                        }
                    } else if (Bpmn.TF.equals(c.getNamespaceURI())) {
                        foreign.add(new Foreign("tfSettings", id, name, "tf:" + local + ", outside its extensions"));
                    } else {
                        notes.add("Something other than the process was left out (" + c.getTagName() + ").");
                    }
                }
            }
            description(e, id, name);
            extensions(e, shape.tf(), id, name);
        }

        /**
         * La description d'un élément est un texte, un seul : pas de balise dedans (ce qu'on lirait en perdrait une
         * partie), pas deux descriptions (la seconde serait perdue), rien d'autre que son identifiant et son format.
         */
        private void description(Element owner, String id, String name) {
            List<Element> docs = new ArrayList<>();
            for (Element c : children(owner)) {
                if (Bpmn.MODEL.equals(c.getNamespaceURI()) && "documentation".equals(c.getLocalName())) {
                    docs.add(c);
                }
            }
            if (docs.size() > 1) {
                foreign.add(new Foreign("documentation", id, name, "several descriptions"));
            }
            for (Element doc : docs) {
                if (!children(doc).isEmpty()) {
                    foreign.add(new Foreign("documentation", id, name, "markup inside it"));
                }
                NamedNodeMap attributes = doc.getAttributes();
                for (int i = 0; i < attributes.getLength(); i++) {
                    Attr a = (Attr) attributes.item(i);
                    String local = a.getLocalName() != null ? a.getLocalName() : a.getName();
                    String ns = a.getNamespaceURI();
                    // Sa langue (xml:lang) ou un espace de noms ne change rien aux mots.
                    boolean known = ns == null ? "id".equals(local) || "textFormat".equals(local)
                        : XMLConstants.XMLNS_ATTRIBUTE_NS_URI.equals(ns) || XMLConstants.XML_NS_URI.equals(ns)
                            || Bpmn.XSI.equals(ns);
                    if (!known) {
                        foreign.add(new Foreign("documentation", id, name, "a setting " + local));
                    }
                }
            }
        }

        /**
         * Les extensions d'un élément : l'élément tf: qui a sa place là (tf:process sur le processus, tf:step sur une
         * étape, tf:condition sur un chemin), une fois, selon le schéma de tf: ; les réglages d'un autre outil, laissés
         * de côté et dits une fois par outil.
         */
        private void extensions(Element owner, String expected, String id, String name) {
            Element ext = child(owner, "extensionElements");
            if (ext == null) {
                return;
            }
            boolean seen = false;
            for (Element c : children(ext)) {
                if (!Bpmn.TF.equals(c.getNamespaceURI())) {
                    notes.add(settings(Objects.toString(c.getNamespaceURI(), c.getTagName())));
                    continue;
                }
                String tag = "tf:" + c.getLocalName();
                if (!c.getLocalName().equals(expected)) {
                    foreign.add(new Foreign("tfSettings", id, name, tag + ", which doesn't go there"));
                } else if (seen) {
                    foreign.add(new Foreign("tfSettings", id, name, tag + ", twice"));
                } else if (!followsSchema(c)) {
                    foreign.add(new Foreign("tfSettings", id, name, tag));
                }
                seen |= c.getLocalName().equals(expected);
            }
        }

        /**
         * Vrai quand l'élément tf: suit le schéma de l'extension, ses valeurs mises à part : une valeur entre dans le
         * modèle, où le vérificateur la dit en phrase.
         */
        private boolean followsSchema(Element tf) {
            List<String> errors = new ArrayList<>();
            tfValidator.setErrorHandler(new ErrorHandler() {
                @Override
                public void warning(SAXParseException e) {
                    // Rien du processus.
                }

                @Override
                public void error(SAXParseException e) {
                    errors.add(Objects.toString(e.getMessage(), ""));
                }

                @Override
                public void fatalError(SAXParseException e) throws SAXException {
                    throw e;
                }
            });
            try {
                tfValidator.validate(new DOMSource(tf));
            } catch (SAXException | IOException e) {
                return false;
            }
            return errors.stream().allMatch(m -> VALUE_ERRORS.stream().anyMatch(m::startsWith));
        }

        private static final String DRAWING = "Notes drawn on the diagram were left out: TaskForce keeps the process, "
            + "not its drawing.";

        private static String settings(String tool) {
            return "Settings for another tool were left out (" + tool + "): TaskForce doesn't run them.";
        }

        // --------------------------------------------------------------------------------------------- outils

        private static List<Element> definitions(Element event) {
            List<Element> out = new ArrayList<>();
            for (Element c : children(event)) {
                if (Bpmn.MODEL.equals(c.getNamespaceURI())
                    && (c.getLocalName().endsWith("EventDefinition") || "eventDefinitionRef".equals(c.getLocalName()))) {
                    out.add(c);
                }
            }
            return out;
        }

        private static Element tf(Element owner, String name) {
            Element ext = child(owner, "extensionElements");
            return ext == null ? null : tfChild(ext, name);
        }

        private static String attrOf(Element tf, String child, String name) {
            Element c = tfChild(tf, child);
            return c == null ? null : attr(c, name);
        }

        private static Element tfChild(Element owner, String name) {
            for (Element c : children(owner)) {
                if (Bpmn.TF.equals(c.getNamespaceURI()) && name.equals(c.getLocalName())) {
                    return c;
                }
            }
            return null;
        }

        private static List<Element> tfChildren(Element owner, String name) {
            List<Element> out = new ArrayList<>();
            for (Element c : children(owner)) {
                if (Bpmn.TF.equals(c.getNamespaceURI()) && name.equals(c.getLocalName())) {
                    out.add(c);
                }
            }
            return out;
        }

        private static Element child(Element owner, String local) {
            for (Element c : children(owner)) {
                if (Bpmn.MODEL.equals(c.getNamespaceURI()) && local.equals(c.getLocalName())) {
                    return c;
                }
            }
            return null;
        }

        private static List<Element> children(Element owner) {
            List<Element> out = new ArrayList<>();
            for (Node n = owner.getFirstChild(); n != null; n = n.getNextSibling()) {
                if (n instanceof Element el) {
                    out.add(el);
                }
            }
            return out;
        }

        private static String documentation(Element owner) {
            Element doc = child(owner, "documentation");
            return doc == null ? null : text(doc);
        }

        private static String text(Element e) {
            return e == null ? null : e.getTextContent();
        }

        private static String attr(Element e, String name) {
            return e.hasAttribute(name) ? e.getAttribute(name) : null;
        }

        /** Le nom local d'une référence qualifiée ({@code bpmn:Task_1} devient {@code Task_1}). */
        private static String local(String qname) {
            if (qname == null) {
                return null;
            }
            int colon = qname.indexOf(':');
            return colon < 0 ? qname : qname.substring(colon + 1);
        }

        private static Integer integer(String value) {
            if (value == null) {
                return null;
            }
            try {
                return Integer.valueOf(value.strip());
            } catch (NumberFormatException e) {
                // Un nombre illisible n'est pas un nombre de tentatives : le vérificateur le refuse.
                return 0;
            }
        }
    }
}
