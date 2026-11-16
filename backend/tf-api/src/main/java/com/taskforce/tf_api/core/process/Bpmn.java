package com.taskforce.tf_api.core.process;

/**
 * Les espaces de noms du XML de BPMN 2.0 que TaskForce lit et écrit, et celui de son extension {@code tf:}
 * (contracts/process/README.md).
 */
public final class Bpmn {

    public static final String MODEL = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    public static final String BPMNDI = "http://www.omg.org/spec/BPMN/20100524/DI";
    public static final String DC = "http://www.omg.org/spec/DD/20100524/DC";
    public static final String DI = "http://www.omg.org/spec/DD/20100524/DI";
    public static final String XSI = "http://www.w3.org/2001/XMLSchema-instance";
    /** L'extension de TaskForce, version 1 : ce que BPMN ne porte pas (ADR-027, point 5). */
    public static final String TF = "https://taskforce-project.fr/schema/process/1";
    /** La langue d'une condition : des mots, que {@code tf:condition} compile pour du code. */
    public static final String CONDITION_LANGUAGE = TF + "#condition";
    /** L'espace de noms cible des fichiers que TaskForce écrit. */
    public static final String TARGET = "https://taskforce-project.fr/processes";

    private Bpmn() {
    }
}
