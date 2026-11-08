package com.taskforce.tf_api.core.service.agent;

import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;

/**
 * Une colonne du banc des modèles (R131, séance n°19) : une tâche du vrai travail de TaskForce, pas une capacité. Le banc
 * répond à « que puis-je confier à ce modèle ? », tâche par tâche ; {@code trial} dit si la tâche s'essaie à l'aveugle sur
 * une issue de la personne, et {@code ask} ce que ce modèle reçoit alors comme consigne.
 */
public enum BenchmarkTask {

    SUMMARIZE("Summarize", "An issue with its comments", "Summarize this issue in three sentences at most: where it "
        + "stands, what was decided, what is left. Write in the language of the issue."),
    TRIAGE("Triage", "Priority, type and labels from a description", "Triage this issue. Answer with three lines: its "
        + "priority (urgent, high, medium or low), its type, and its labels, only from what the project offers."),
    ACT("Act", "Changes the board through the tools, in several steps", null),
    ANSWER("Answer", "From a document, or says that the document does not say", null),
    WRITE("Write", "A comment or a note, with constraints", "Write the next useful comment on this issue: three sentences "
        + "at most, no greeting, in the language of the issue, and only what the issue says."),
    PLAN("Plan", "Splits a goal into steps", "Split this issue into 3 to 7 numbered steps, in order, one line each, in the "
        + "language of the issue. No dates, no names."),
    CODE("Code", "Fixes a small bug, writes a small function", null);

    private final String label;
    private final String description;
    private final String ask;

    BenchmarkTask(String label, String description, String ask) {
        this.label = label;
        this.description = description;
        this.ask = ask;
    }

    /** La clé de l'API et de la base : le nom en minuscules. */
    public String key() {
        return name().toLowerCase(Locale.ROOT);
    }

    public String label() {
        return label;
    }

    public String description() {
        return description;
    }

    /** La consigne de l'essai à l'aveugle sur une issue ; {@code null} pour une tâche qui ne s'y essaie pas. */
    public String ask() {
        return ask;
    }

    /** La tâche s'essaie à l'aveugle sur une issue de la personne (R131). */
    public boolean trial() {
        return ask != null;
    }

    public static Optional<BenchmarkTask> of(String key) {
        return Arrays.stream(values()).filter(task -> task.key().equals(key)).findFirst();
    }
}
