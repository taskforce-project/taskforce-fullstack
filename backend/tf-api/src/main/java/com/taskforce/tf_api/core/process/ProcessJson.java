package com.taskforce.tf_api.core.process;

import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Le JSON du modèle des processus : ce que la base garde, ce que l'empreinte lit, ce qu'un brouillon rend. Un champ
 * inconnu ne casse rien (un modèle plus récent reste lisible) ; un champ nul n'est jamais écrit.
 */
public final class ProcessJson {

    private static final ObjectMapper JSON = new ObjectMapper()
        .setSerializationInclusion(JsonInclude.Include.NON_NULL)
        .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    private ProcessJson() {
    }

    public static JsonNode tree(ProcessModel model) {
        return JSON.valueToTree(model);
    }

    public static Map<String, Object> toMap(ProcessModel model) {
        return JSON.convertValue(model, MAP);
    }

    public static ProcessModel fromMap(Map<String, Object> map) {
        return JSON.convertValue(map, ProcessModel.class);
    }

    public static ProcessModel read(String json) {
        try {
            return JSON.readValue(json, ProcessModel.class);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("This isn't a process TaskForce can read.", e);
        }
    }

    public static String write(ProcessModel model) {
        try {
            return JSON.writerWithDefaultPrettyPrinter().writeValueAsString(model);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
