package com.taskforce.tf_api.core.service.mcpserver;

import java.util.Locale;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Lecture des arguments d'un appel d'outil. Une valeur absente ou mal formée lève {@link InvalidArgumentException},
 * rendue au modèle comme une erreur d'outil ({@code isError}) qu'il peut corriger, pas comme une panne du serveur.
 */
final class McpArgs {

    private McpArgs() {}

    /** Argument manquant ou invalide. */
    static final class InvalidArgumentException extends RuntimeException {
        InvalidArgumentException(String message) {
            super(message);
        }
    }

    static long requiredLong(JsonNode args, String name) {
        JsonNode value = args.get(name);
        if (value == null || value.isNull()) {
            throw new InvalidArgumentException("Missing argument: " + name);
        }
        if (!value.canConvertToLong() || !value.isIntegralNumber()) {
            throw new InvalidArgumentException(name + " must be an integer");
        }
        return value.asLong();
    }

    static Long optionalLong(JsonNode args, String name) {
        JsonNode value = args.get(name);
        return value == null || value.isNull() ? null : requiredLong(args, name);
    }

    static Integer optionalInt(JsonNode args, String name, int min, int max) {
        Long value = optionalLong(args, name);
        if (value == null) return null;
        if (value < min || value > max) {
            throw new InvalidArgumentException(name + " must be between " + min + " and " + max);
        }
        return value.intValue();
    }

    static String requiredString(JsonNode args, String name, int maxLength) {
        String value = optionalString(args, name, maxLength);
        if (value == null || value.isBlank()) {
            throw new InvalidArgumentException("Missing argument: " + name);
        }
        return value;
    }

    static String optionalString(JsonNode args, String name, int maxLength) {
        JsonNode value = args.get(name);
        if (value == null || value.isNull()) return null;
        if (!value.isTextual()) {
            throw new InvalidArgumentException(name + " must be a string");
        }
        if (value.asText().length() > maxLength) {
            throw new InvalidArgumentException(name + " is too long (" + maxLength + " characters at most)");
        }
        return value.asText();
    }

    static <E extends Enum<E>> E optionalEnum(JsonNode args, String name, Class<E> type) {
        String value = optionalString(args, name, 40);
        if (value == null) return null;
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new InvalidArgumentException(name + " has an unknown value: " + value);
        }
    }

    /** Date ISO {@code YYYY-MM-DD}, telle que l'API REST l'attend. */
    static String optionalDate(JsonNode args, String name) {
        String value = optionalString(args, name, 10);
        if (value != null && !value.matches("\\d{4}-\\d{2}-\\d{2}")) {
            throw new InvalidArgumentException(name + " must be a date as YYYY-MM-DD");
        }
        return value;
    }
}
