package com.taskforce.tf_api.core.service.agent;

import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;

/**
 * Ce que sait faire un modèle, dans la table de R113 (séance n°16) : chaque capacité se mesure par des cas fixes de la
 * banque, sur la machine ou le serveur, jamais d'après la fiche du fournisseur. {@code request} dit, dans la phrase que
 * TaskForce écrit à la personne, le genre de demande que la capacité couvre (R118).
 */
public enum Capability {

    TOOLS("Tools", "Calls TaskForce's tools with the right issue and fields", "requests that use TaskForce's tools"),
    CONTEXT("Long context", "Finds a fact at the start of a long document", "long conversations"),
    CODE("Code", "Reads code and says what it prints", "questions about code"),
    FRENCH("French", "Understands a request in French and answers in French", "requests in French"),
    ENGLISH("English", "Understands a request in English and answers in English", "requests in English");

    private final String label;
    private final String description;
    private final String request;

    Capability(String label, String description, String request) {
        this.label = label;
        this.description = description;
        this.request = request;
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

    /** Le genre de demande, dans une phrase de TaskForce : « failed 1 of 2 test cases for requests in French ». */
    public String request() {
        return request;
    }

    public static Optional<Capability> of(String key) {
        return Arrays.stream(values()).filter(capability -> capability.key().equals(key)).findFirst();
    }
}
