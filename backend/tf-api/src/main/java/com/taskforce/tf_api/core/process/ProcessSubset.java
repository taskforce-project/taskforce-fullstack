package com.taskforce.tf_api.core.process;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Le sous-ensemble de BPMN 2.0 de J2 (ADR-027, point 4), en liste écrite : pris surtout dans la sous-classe « Common
 * Executable » de BPMN 2.0.2, plus la zone ad hoc et la minuterie de bordure, sans revendiquer la conformité de la
 * sous-classe. Il se fige sur ce qu'exige le processus d'E20, « intégrer un module » : un test vérifie que l'export de
 * ce processus emploie chacun de ces éléments, et aucun autre. Tout le reste est refusé à l'import, avec sa raison en
 * mots ({@link #reason}). La même liste, en prose, est dans {@code contracts/process/README.md}.
 */
public final class ProcessSubset {

    /** Un élément de BPMN 2.0 (son nom local, dans l'espace de noms du modèle) et ce qu'il est chez nous. */
    public record Element(String bpmn, String model) {
    }

    public static final List<Element> ELEMENTS = List.of(
        new Element("definitions", "the file"),
        new Element("process", "the process: its key, its name"),
        new Element("documentation", "the description of the process or of a step"),
        new Element("extensionElements", "where the tf: extension travels"),
        new Element("startEvent", "start (no trigger)"),
        new Element("endEvent", "end"),
        new Element("terminateEventDefinition", "end that stops the whole process, at the top level only"),
        new Element("subProcess", "stage, a column of the view, at the top level only"),
        new Element("adHocSubProcess", "agent zone, holding agent steps only"),
        new Element("serviceTask", "agent step, inside an agent zone"),
        new Element("userTask", "human task"),
        new Element("exclusiveGateway", "decision, with a condition on each path but one, its default path"),
        new Element("parallelGateway", "paths in parallel: split and join"),
        new Element("intermediateCatchEvent", "wait"),
        new Element("timerEventDefinition", "a wait or a deadline that lasts a duration"),
        new Element("timeDuration", "the duration, in ISO 8601"),
        new Element("messageEventDefinition", "a wait for something a person provides"),
        new Element("message", "what a wait expects"),
        new Element("boundaryEvent", "deadline or failure path, attached to a step"),
        new Element("errorEventDefinition", "failure path of an agent zone or a stage"),
        new Element("sequenceFlow", "path"),
        new Element("conditionExpression", "the words of a path's condition; what code judges is in tf:condition"),
        new Element("incoming", "derived from the paths"),
        new Element("outgoing", "derived from the paths"));

    private static final Map<String, String> REASONS = new LinkedHashMap<>();

    static {
        REASONS.put("inclusiveGateway", "“{name}” takes several paths at once, chosen by conditions (an inclusive "
            + "gateway): TaskForce's processes don't do that. Use a decision, or paths in parallel.");
        REASONS.put("complexGateway", "“{name}” joins paths by a rule of its own (a complex gateway): TaskForce's "
            + "processes don't do that. Use a decision, or paths in parallel.");
        REASONS.put("eventBasedGateway", "“{name}” waits for whichever event comes first (an event-based gateway): "
            + "TaskForce's processes don't do that yet. Wait for one thing at a time.");
        REASONS.put("multiInstance", "“{name}” runs once for each item of a list (multi-instance): TaskForce's "
            + "processes don't do that. Write one step for the whole list, or an agent zone.");
        REASONS.put("loop", "“{name}” repeats itself until a condition holds (a loop): TaskForce's processes don't do "
            + "that. Use a decision that leads back to the step.");
        REASONS.put("eventSubProcess", "“{name}” starts on its own when something happens (an event subprocess): "
            + "TaskForce's processes don't do that.");
        REASONS.put("transaction", "“{name}” is a transaction: TaskForce's processes don't have transactions. Use a "
            + "stage.");
        REASONS.put("signal", "“{name}” sends or waits for a signal: TaskForce's processes don't use signals. Use a "
            + "wait for something a person provides.");
        REASONS.put("escalation", "“{name}” escalates: TaskForce's processes don't use escalations. Use a deadline, "
            + "then a human task.");
        REASONS.put("compensation", "“{name}” undoes earlier steps (compensation): TaskForce's processes can't do that "
            + "yet.");
        REASONS.put("conditionalEvent", "“{name}” waits until a condition holds: TaskForce's processes don't do that. "
            + "Use a decision.");
        REASONS.put("link", "“{name}” jumps to another part of the drawing (a link): TaskForce's processes don't do "
            + "that. Draw the path itself.");
        REASONS.put("cancel", "“{name}” cancels a transaction: TaskForce's processes don't have transactions.");
        REASONS.put("dataObject", "“{name}” is data drawn in the process (a data object or a data store): "
            + "TaskForce's processes don't carry data. Say which documents a step expects instead.");
        REASONS.put("lanes", "The process is drawn in lanes: TaskForce's processes don't use lanes. Say who answers for "
            + "each step instead.");
        REASONS.put("collaboration", "The file draws pools and messages between them (a collaboration): TaskForce "
            + "imports one process, without pools.");
        REASONS.put("businessRuleTask", "“{name}” is a business rule task (DMN): TaskForce's processes use rules "
            + "written in words instead.");
        REASONS.put("scriptTask", "“{name}” runs a script: nobody writes code in TaskForce's processes. Use an agent "
            + "step, under rules.");
        REASONS.put("sendTask", "“{name}” sends a message (a send task): TaskForce's processes don't do that yet. Use "
            + "an agent step, under rules.");
        REASONS.put("receiveTask", "“{name}” waits for a message (a receive task): use a wait for something a person "
            + "provides.");
        REASONS.put("manualTask", "“{name}” is a manual task: make it a human task, and say who does it.");
        REASONS.put("task", "“{name}” doesn't say who does it (a task of no kind): make it a human task or an agent "
            + "step.");
        REASONS.put("callActivity", "“{name}” calls another process: TaskForce's processes can't do that yet.");
        REASONS.put("intermediateThrowEvent", "“{name}” sends an event (a throw event): TaskForce's processes don't do "
            + "that.");
        REASONS.put("startTrigger", "“{name}” starts the process on an event: a TaskForce process starts when a person "
            + "starts it.");
        REASONS.put("endTrigger", "“{name}” ends by sending an event: a TaskForce process ends plainly, or stops as a "
            + "whole.");
        REASONS.put("timerDate", "“{name}” waits until a date: in TaskForce's processes, a wait lasts a duration.");
        REASONS.put("timerCycle", "“{name}” comes back on a cycle: in TaskForce's processes, a wait lasts a duration.");
        REASONS.put("nonInterruptingDeadline", "“{name}” is a deadline that lets its step go on: in TaskForce's "
            + "processes, a deadline stops its step and takes its own path.");
        REASONS.put("boundaryTrigger", "“{name}” watches its step for an event TaskForce's processes don't have: only a "
            + "deadline or a failure path can be attached to a step.");
        REASONS.put("severalProcesses", "This file holds several processes: TaskForce imports one at a time.");
        REASONS.put("completionCondition", "The agent zone “{name}” ends on a condition of its own: in TaskForce's "
            + "processes, a zone ends when its agent has done its work.");
        REASONS.put("rendering", "“{name}” comes with a form drawn for another tool: in TaskForce's processes, a human "
            + "task asks what its settings say.");
        REASONS.put("service", "“{name}” calls a service of another system: TaskForce's steps are done by a person, or "
            + "by an agent under rules.");
        REASONS.put("setting", "“{name}” has a setting TaskForce's processes don't have: {detail}.");
        REASONS.put("conditionLanguage", "The condition of the path “{name}” is written for another engine ({detail}): "
            + "TaskForce's conditions are words, with the step and the result code judges. Write it that way.");
        REASONS.put("tfSettings", "“{name}” carries TaskForce settings this version doesn't read ({detail}): they come "
            + "from another version of TaskForce, or were changed by hand.");
        REASONS.put("conditionNoLanguage", "The condition of the path “{name}” says what code judges, but not that its "
            + "words are TaskForce's: without TaskForce's condition language, another engine's expression would be read "
            + "as its words. Export the process again from TaskForce.");
        REASONS.put("documentation", "“{name}” has a description TaskForce can't keep as it is ({detail}): a description "
            + "is one text, in words.");
    }

    private ProcessSubset() {
    }

    /** Les éléments refusés que la liste nomme, dans l'ordre où elle les dit. */
    public static List<String> refused() {
        return List.copyOf(REASONS.keySet());
    }

    /**
     * Pourquoi un élément n'entre pas, en une phrase : {@code element} est un nom de la liste des refus, ou le nom local
     * d'un élément de BPMN que la liste ne connaît pas.
     */
    public static String reason(String element, String name) {
        return reason(element, name, null);
    }

    /** La même phrase, avec ce qui précise l'élément quand elle le cite (un réglage et sa valeur, une langue). */
    public static String reason(String element, String name, String detail) {
        String sentence = REASONS.get(element);
        if (sentence == null) {
            sentence = "“{name}” is a BPMN element TaskForce's processes don't have (" + element + ").";
        }
        return sentence.replace("{name}", name == null || name.isBlank() ? element : name)
            .replace("{detail}", detail == null ? element : detail);
    }
}
