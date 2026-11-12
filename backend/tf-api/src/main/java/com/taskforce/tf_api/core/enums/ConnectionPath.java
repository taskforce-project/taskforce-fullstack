package com.taskforce.tf_api.core.enums;

import java.util.Arrays;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Le chemin de connexion qu'un éditeur permet (séance n°22, R154) : pour la personne, toujours le même geste ;
 * derrière, TaskForce prend celui-ci. Le mot entre guillemets est celui du fichier des préréglages et de l'API.
 *
 * <ul>
 *   <li>{@link #SELF_REGISTRATION} (A) : le serveur laisse tout client s'inscrire seul, par un document de métadonnées
 *       (CIMD) ou par l'inscription dynamique (DCR).</li>
 *   <li>{@link #OUR_APP} (B) : une application enregistrée chez l'éditeur, la nôtre (variables d'environnement) ou, à
 *       défaut, celle de l'entreprise.</li>
 *   <li>{@link #COMPANY_APP} (C) : l'application de l'entreprise, que son administrateur crée et saisit une fois.</li>
 *   <li>{@link #API_KEY} (D) : une clé guidée, en dernier recours.</li>
 *   <li>{@link #SERVER_URL} : l'adresse du serveur que l'entreprise crée chez l'éditeur ; elle vaut une clé.</li>
 *   <li>{@link #OPEN} : un serveur public, sans connexion.</li>
 * </ul>
 */
public enum ConnectionPath {
    SELF_REGISTRATION("self-registration"),
    OUR_APP("our-app"),
    COMPANY_APP("company-app"),
    API_KEY("api-key"),
    SERVER_URL("server-url"),
    OPEN("open");

    private final String wire;

    ConnectionPath(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static ConnectionPath of(String wire) {
        return Arrays.stream(values()).filter(p -> p.wire.equals(wire)).findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Unknown connection path: " + wire));
    }

    /** Le chemin passe-t-il par le navigateur et l'OAuth de l'éditeur ? */
    public boolean usesOAuth() {
        return this == SELF_REGISTRATION || this == OUR_APP || this == COMPANY_APP;
    }
}
