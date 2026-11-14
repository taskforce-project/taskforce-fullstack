package com.taskforce.tf_api.core.process;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.taskforce.tf_api.core.process.BpmnLayout.Box;
import com.taskforce.tf_api.core.process.BpmnLayout.Point;
import com.taskforce.tf_api.core.process.ProcessModel.AgentSettings;
import com.taskforce.tf_api.core.process.ProcessModel.Field;
import com.taskforce.tf_api.core.process.ProcessModel.Flow;
import com.taskforce.tf_api.core.process.ProcessModel.HumanTask;
import com.taskforce.tf_api.core.process.ProcessModel.RuleRef;
import com.taskforce.tf_api.core.process.ProcessModel.Step;

/**
 * L'export d'un processus en XML de BPMN 2.0 (ADR-027) : le sous-ensemble ({@link ProcessSubset}) pour la sémantique,
 * l'extension {@code tf:} pour ce que BPMN ne porte pas, et un dessin calculé ({@link BpmnLayout}) pour qu'un modeleur
 * l'ouvre. Un modeleur qui ignore {@code tf:} garde le processus lisible : les noms, les chemins, les conditions en mots,
 * les attentes et les échéances sont en BPMN. La sortie est stable : le même modèle donne le même texte.
 */
public final class BpmnExport {

    private BpmnExport() {
    }

    public static String toXml(ProcessModel model) {
        return new Writer(model).write();
    }

    /** Le nom du fichier d'une version : {@code integrate-a-module-v3.bpmn}. */
    public static String fileName(String key, Integer version) {
        return key + (version == null ? "" : "-v" + version) + ".bpmn";
    }

    private static final class Writer {

        private final ProcessModel model;
        private final StringBuilder out = new StringBuilder();
        private final BpmnLayout layout;
        private int depth;

        Writer(ProcessModel model) {
            this.model = model;
            this.layout = BpmnLayout.of(model);
        }

        String write() {
            out.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
            open("bpmn:definitions",
                "xmlns:bpmn", Bpmn.MODEL,
                "xmlns:bpmndi", Bpmn.BPMNDI,
                "xmlns:dc", Bpmn.DC,
                "xmlns:di", Bpmn.DI,
                "xmlns:xsi", Bpmn.XSI,
                "xmlns:tf", Bpmn.TF,
                "id", model.key() + ".definitions",
                "targetNamespace", Bpmn.TARGET,
                "exporter", "TaskForce",
                "exporterVersion", ProcessModel.FORMAT);
            for (Step wait : model.allSteps()) {
                if (ProcessModel.WAIT.equals(wait.type()) && wait.waitFor() != null
                    && ProcessModel.MESSAGE.equals(wait.waitFor().kind())) {
                    empty("bpmn:message", "id", wait.id() + ".message", "name", wait.waitFor().what());
                }
            }
            open("bpmn:process", "id", model.key(), "name", model.name(), "isExecutable", "true");
            documentation(model.description());
            open("bpmn:extensionElements");
            empty("tf:process", "format", ProcessModel.FORMAT, "derivedFrom", model.derivedFrom());
            close("bpmn:extensionElements");
            container(model.stepsOrEmpty(), model.flowsOrEmpty());
            close("bpmn:process");
            diagram();
            close("bpmn:definitions");
            return out.toString();
        }

        // --------------------------------------------------------------------------------------------- le processus

        private void container(List<Step> steps, List<Flow> flows) {
            Map<String, List<String>> in = new HashMap<>();
            Map<String, List<String>> outs = new HashMap<>();
            for (Flow f : flows) {
                outs.computeIfAbsent(f.from(), k -> new ArrayList<>()).add(f.id());
                in.computeIfAbsent(f.to(), k -> new ArrayList<>()).add(f.id());
            }
            for (Step step : steps) {
                step(step, in.getOrDefault(step.id(), List.of()), outs.getOrDefault(step.id(), List.of()), flows);
            }
            for (Flow f : flows) {
                flow(f);
            }
        }

        private void step(Step step, List<String> in, List<String> outs, List<Flow> flows) {
            String element = element(step);
            List<String> attrs = new ArrayList<>(List.of("id", step.id()));
            add(attrs, "name", step.name());
            if (ProcessModel.DECISION.equals(step.type())) {
                flows.stream().filter(f -> step.id().equals(f.from()) && f.otherwiseFlow()).findFirst()
                    .ifPresent(f -> add(attrs, "default", f.id()));
            }
            if (step.boundary()) {
                add(attrs, "attachedToRef", step.attachedTo());
            }
            open(element, attrs.toArray(String[]::new));
            documentation(step.description());
            extension(step);
            in.forEach(id -> text("bpmn:incoming", id));
            outs.forEach(id -> text("bpmn:outgoing", id));
            switch (step.type()) {
                case ProcessModel.STAGE -> container(step.stepsOrEmpty(), step.flowsOrEmpty());
                case ProcessModel.ZONE -> step.stepsOrEmpty().forEach(inner -> step(inner, List.of(), List.of(), List.of()));
                case ProcessModel.END -> {
                    if (Boolean.TRUE.equals(step.terminate())) {
                        empty("bpmn:terminateEventDefinition", "id", step.id() + ".terminate");
                    }
                }
                case ProcessModel.WAIT -> {
                    if (step.waitFor() != null && ProcessModel.TIMER.equals(step.waitFor().kind())) {
                        timer(step.id(), step.waitFor().duration());
                    } else {
                        empty("bpmn:messageEventDefinition", "id", step.id() + ".event", "messageRef",
                            step.id() + ".message");
                    }
                }
                case ProcessModel.DEADLINE -> timer(step.id(), step.duration());
                case ProcessModel.FAILURE -> empty("bpmn:errorEventDefinition", "id", step.id() + ".event");
                default -> { }
            }
            close(element);
        }

        private static String element(Step step) {
            return switch (step.type()) {
                case ProcessModel.START -> "bpmn:startEvent";
                case ProcessModel.END -> "bpmn:endEvent";
                case ProcessModel.STAGE -> "bpmn:subProcess";
                case ProcessModel.ZONE -> "bpmn:adHocSubProcess";
                case ProcessModel.AGENT -> "bpmn:serviceTask";
                case ProcessModel.HUMAN -> "bpmn:userTask";
                case ProcessModel.DECISION -> "bpmn:exclusiveGateway";
                case ProcessModel.PARALLEL -> "bpmn:parallelGateway";
                case ProcessModel.WAIT -> "bpmn:intermediateCatchEvent";
                case ProcessModel.DEADLINE, ProcessModel.FAILURE -> "bpmn:boundaryEvent";
                default -> throw new IllegalArgumentException("This step can't be written in BPMN: " + step.type());
            };
        }

        private void timer(String id, String duration) {
            open("bpmn:timerEventDefinition", "id", id + ".event");
            text("bpmn:timeDuration", duration == null ? "" : duration, "xsi:type", "bpmn:tFormalExpression");
            close("bpmn:timerEventDefinition");
        }

        /** Ce que BPMN ne porte pas, dans {@code tf:step} (contracts/process/README.md). */
        private void extension(Step step) {
            List<String> attrs = new ArrayList<>();
            add(attrs, "answeredBy", step.answeredBy());
            if (step.lock() != null) {
                add(attrs, "lock", step.lock().by());
                add(attrs, "lockRef", step.lock().ref());
            }
            add(attrs, "issue", step.issue());
            boolean children = step.agent() != null || step.human() != null || step.rules() != null
                || step.documents() != null || (step.waitFor() != null && step.waitFor().from() != null);
            if (attrs.isEmpty() && !children) {
                return;
            }
            open("bpmn:extensionElements");
            if (!children) {
                empty("tf:step", attrs.toArray(String[]::new));
            } else {
                open("tf:step", attrs.toArray(String[]::new));
                agent(step.agent());
                human(step.human());
                if (step.waitFor() != null && step.waitFor().from() != null) {
                    empty("tf:wait", "from", step.waitFor().from());
                }
                if (step.rules() != null) {
                    for (RuleRef rule : step.rules()) {
                        empty("tf:rule", "ref", rule.ref(), "version", rule.version() == null ? null
                            : String.valueOf(rule.version()));
                    }
                }
                if (step.documents() != null) {
                    step.documents().forEach(d -> empty("tf:document", "name", d));
                }
                close("tf:step");
            }
            close("bpmn:extensionElements");
        }

        private void agent(AgentSettings agent) {
            if (agent == null) {
                return;
            }
            String[] attrs = {"provider", agent.provider(), "model", agent.model(), "attempts",
                agent.attempts() == null ? null : String.valueOf(agent.attempts()), "timeout", agent.timeout()};
            if (agent.tools() == null) {
                empty("tf:agent", attrs);
                return;
            }
            open("tf:agent", attrs);
            agent.tools().forEach(t -> empty("tf:tool", "name", t));
            close("tf:agent");
        }

        private void human(HumanTask human) {
            if (human == null) {
                return;
            }
            String[] attrs = {"who", human.who(), "kind", human.kind(), "meaning", human.meaning(), "question",
                human.question()};
            if (human.checklist() == null && human.fields() == null) {
                empty("tf:human", attrs);
                return;
            }
            open("tf:human", attrs);
            if (human.checklist() != null) {
                human.checklist().forEach(line -> empty("tf:item", "text", line));
            }
            if (human.fields() != null) {
                for (Field field : human.fields()) {
                    String[] f = {"id", field.id(), "label", field.label(), "type", field.type()};
                    if (field.choices() == null) {
                        empty("tf:field", f);
                    } else {
                        open("tf:field", f);
                        field.choices().forEach(c -> empty("tf:choice", "value", c));
                        close("tf:field");
                    }
                }
            }
            close("tf:human");
        }

        private void flow(Flow f) {
            List<String> attrs = new ArrayList<>(List.of("id", f.id()));
            add(attrs, "name", f.name());
            attrs.addAll(List.of("sourceRef", f.from(), "targetRef", f.to()));
            ProcessModel.Condition c = f.condition();
            if (c == null) {
                empty("bpmn:sequenceFlow", attrs.toArray(String[]::new));
                return;
            }
            open("bpmn:sequenceFlow", attrs.toArray(String[]::new));
            if (c.step() != null || c.outcome() != null) {
                open("bpmn:extensionElements");
                empty("tf:condition", "step", c.step(), "outcome", c.outcome());
                close("bpmn:extensionElements");
            }
            text("bpmn:conditionExpression", c.text() == null ? "" : c.text(), "xsi:type", "bpmn:tFormalExpression",
                "language", Bpmn.CONDITION_LANGUAGE);
            close("bpmn:sequenceFlow");
        }

        private void documentation(String text) {
            if (text != null) {
                text("bpmn:documentation", text);
            }
        }

        // --------------------------------------------------------------------------------------------- le dessin

        private void diagram() {
            open("bpmndi:BPMNDiagram", "id", model.key() + ".diagram");
            open("bpmndi:BPMNPlane", "id", model.key() + ".plane", "bpmnElement", model.key());
            shapes(model.stepsOrEmpty(), model.flowsOrEmpty());
            close("bpmndi:BPMNPlane");
            close("bpmndi:BPMNDiagram");
        }

        private void shapes(List<Step> steps, List<Flow> flows) {
            for (Step step : steps) {
                Box box = layout.boxes.get(step.id());
                if (box != null) {
                    List<String> attrs = new ArrayList<>(List.of("id", step.id() + ".di", "bpmnElement", step.id()));
                    if (step.container()) {
                        attrs.addAll(List.of("isExpanded", "true"));
                    }
                    if (ProcessModel.DECISION.equals(step.type())) {
                        attrs.addAll(List.of("isMarkerVisible", "true"));
                    }
                    open("bpmndi:BPMNShape", attrs.toArray(String[]::new));
                    empty("dc:Bounds", "x", String.valueOf(box.x()), "y", String.valueOf(box.y()), "width",
                        String.valueOf(box.w()), "height", String.valueOf(box.h()));
                    close("bpmndi:BPMNShape");
                }
                if (step.container()) {
                    shapes(step.stepsOrEmpty(), step.flowsOrEmpty());
                }
            }
            for (Flow f : flows) {
                List<Point> points = layout.edges.get(f.id());
                if (points == null || points.size() < 2) {
                    continue;
                }
                open("bpmndi:BPMNEdge", "id", f.id() + ".di", "bpmnElement", f.id());
                for (Point p : points) {
                    empty("di:waypoint", "x", String.valueOf(p.x()), "y", String.valueOf(p.y()));
                }
                close("bpmndi:BPMNEdge");
            }
        }

        // --------------------------------------------------------------------------------------------- l'écriture

        private static void add(List<String> attrs, String name, String value) {
            if (value != null) {
                attrs.add(name);
                attrs.add(value);
            }
        }

        private void open(String name, String... attrs) {
            indent();
            out.append('<').append(name);
            attributes(attrs);
            out.append(">\n");
            depth++;
        }

        private void empty(String name, String... attrs) {
            indent();
            out.append('<').append(name);
            attributes(attrs);
            out.append("/>\n");
        }

        private void text(String name, String value, String... attrs) {
            indent();
            out.append('<').append(name);
            attributes(attrs);
            out.append('>').append(escape(value, false)).append("</").append(name).append(">\n");
        }

        private void close(String name) {
            depth--;
            indent();
            out.append("</").append(name).append(">\n");
        }

        private void attributes(String... attrs) {
            for (int i = 0; i + 1 < attrs.length; i += 2) {
                if (attrs[i + 1] != null) {
                    out.append(' ').append(attrs[i]).append("=\"").append(escape(attrs[i + 1], true)).append('"');
                }
            }
        }

        private void indent() {
            out.append("  ".repeat(Math.max(0, depth)));
        }

        static String escape(String value, boolean attribute) {
            StringBuilder s = new StringBuilder(value.length());
            for (int i = 0; i < value.length(); i++) {
                char c = value.charAt(i);
                switch (c) {
                    case '&' -> s.append("&amp;");
                    case '<' -> s.append("&lt;");
                    case '>' -> s.append("&gt;");
                    case '"' -> s.append(attribute ? "&quot;" : "\"");
                    case '\n' -> s.append(attribute ? "&#10;" : "\n");
                    case '\r' -> s.append("&#13;");
                    case '\t' -> s.append(attribute ? "&#9;" : "\t");
                    default -> {
                        // Un caractère de contrôle n'a pas sa place dans un fichier XML 1.0 : il tombe.
                        if (c >= 0x20 || c == '\n' || c == '\t') {
                            s.append(c);
                        }
                    }
                }
            }
            return s.toString();
        }
    }
}
