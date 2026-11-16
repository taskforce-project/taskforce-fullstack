package com.taskforce.tf_api.core.process;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Le schéma de sortie d'un brouillon de processus (ADR-027, point 10) : ce qu'un modèle rend quand il propose un
 * processus, donné en sortie structurée (le {@code format} d'Ollama, le {@code json_schema} d'une API compatible
 * OpenAI). Il dit la forme : le processus dans notre modèle, les questions du brouillon, les étapes écartées avec leur
 * raison. Le vérificateur juge ensuite le brouillon, et une personne l'accepte étape par étape (W4).
 *
 * <p>Le schéma n'emploie que ce que ces sorties structurées savent contraindre : des types, des propriétés, des
 * énumérations, des constantes, des références internes, {@code anyOf}, des bornes et des motifs.</p>
 */
public final class ProcessDraftSchema {

    public static final String RESOURCE = "/process/taskforce-process-draft-1.schema.json";

    private static final JsonNode SCHEMA = load();

    private ProcessDraftSchema() {
    }

    /** Le schéma, à passer tel quel au modèle ; ne pas le modifier. */
    public static JsonNode json() {
        return SCHEMA.deepCopy();
    }

    private static JsonNode load() {
        try (InputStream in = ProcessDraftSchema.class.getResourceAsStream(RESOURCE)) {
            if (in == null) {
                throw new IllegalStateException("The draft schema is missing: " + RESOURCE);
            }
            return new ObjectMapper().readTree(in);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
