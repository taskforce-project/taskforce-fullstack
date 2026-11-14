package com.taskforce.tf_api.core.process;

import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
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
 * {@link Result#foreign()}, que le vérificateur dit en phrases. Le dessin (BPMN DI) est ignoré : il n'est pas le
 * processus. Ce qui n'est ni du processus ni de TaskForce (les réglages d'un autre moteur, des notes dessinées) est
 * laissé de côté, et {@link Result#notes()} le dit.
 *
 * <p>Le fichier vient de dehors : le lecteur refuse les DTD et les entités externes (XXE), ne suit aucune adresse et
 * ne charge rien d'autre que le texte donné.</p>
 */
public final class BpmnImport {

    /** Le plus grand fichier qu'on lit : un processus de la taille permise y tient largement. */
    public static final int MAX_CHARS = 1_000_000;

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
            throw new Unreadable("The file isn't well-formed XML (line " + e.getLineNumber() + ").");
        } catch (SAXException | IOException e) {
            throw new Unreadable("The file isn't well-formed XML.");
        } catch (ParserConfigurationException e) {
            throw new IllegalStateException(e);
        }
    }

    // ------------------------------------------------------------------------------------------------- lire

    private static final class Reader {

        private final Document doc;
        private final List<Foreign> foreign = new ArrayList<>();
        private final Set<String> notes = new LinkedHashSet<>();
        private final Map<String, String> messages = new HashMap<>();

        Reader(Document doc) {
            this.doc = doc;
        }

        Result read() {
            Element root = doc.getDocumentElement();
            if (!Bpmn.MODEL.equals(root.getNamespaceURI()) || !"definitions".equals(root.getLocalName())) {
                throw new Unreadable("This file isn't a BPMN 2.0 file: it has no definitions.");
            }
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
                    case "message" -> messages.put(child.getAttribute("id"), attr(child, "name"));
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
                if (!Bpmn.MODEL.equals(e.getNamespaceURI())) {
                    notes.add("Something other than the process was left out (" + e.getTagName() + ").");
                    continue;
                }
                String local = e.getLocalName();
                switch (local) {
                    case "documentation", "extensionElements", "incoming", "outgoing", "auditing", "monitoring",
                         "categoryValueRef", "ioBinding", "supportedInterfaceRef", "completionCondition" -> { }
                    case "laneSet" -> foreign.add(new Foreign("lanes", attr(e, "id"), null));
                    case "sequenceFlow" -> flows.add(flow(e));
                    case "textAnnotation", "association", "group" -> notes.add("Notes drawn on the diagram were left "
                        + "out: TaskForce keeps the process, not its drawing.");
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
                    return withWait(plain, new WaitFor(ProcessModel.TIMER, text(child(def, "timeDuration")), null, from));
                }
                case "messageEventDefinition" -> {
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
                    return copy(node(e, ProcessModel.DEADLINE), null, host, text(child(def, "timeDuration")), null);
                }
                case "errorEventDefinition" -> {
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

        /** Une étape et ce que {@code tf:step} dit d'elle. */
        private Step node(Element e, String type) {
            Element tf = tf(e, "step");
            vendors(e);
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
                    checklist, fields);
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
            Element expression = child(e, "conditionExpression");
            Element tf = tf(e, "condition");
            Condition condition = expression == null && tf == null ? null
                : new Condition(expression == null ? null : text(expression), tf == null ? null : attr(tf, "step"),
                    tf == null ? null : attr(tf, "outcome"));
            vendors(e);
            return new Flow(attr(e, "id"), attr(e, "sourceRef"), attr(e, "targetRef"), attr(e, "name"), null, condition);
        }

        /** Les réglages d'un autre outil, dans les extensions : laissés de côté, et dit une fois par outil. */
        private void vendors(Element e) {
            Element ext = child(e, "extensionElements");
            if (ext == null) {
                return;
            }
            for (Element c : children(ext)) {
                if (!Bpmn.TF.equals(c.getNamespaceURI())) {
                    notes.add("Settings for another tool were left out (" + c.getNamespaceURI() + "): TaskForce doesn't "
                        + "run them.");
                }
            }
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
