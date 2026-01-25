package com.taskforce.tf_api.shared.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * DTO pour les réponses d'erreur standardisées
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ErrorResponse {

    private int status;
    private String error;
    private String message;
    private String path;
    private LocalDateTime timestamp;

    /**
     * Détails des erreurs de validation (optionnel)
     * Ex: {"email": ["Email is required", "Email is invalid"]}
     */
    private Map<String, List<String>> validationErrors;

    /**
     * Crée une réponse d'erreur simple
     */
    public static ErrorResponse of(int status, String error, String message, String path) {
        return ErrorResponse.builder()
                .status(status)
                .error(error)
                .message(message)
                .path(path)
                .timestamp(LocalDateTime.now())
                .build();
    }

    /**
     * Crée une réponse d'erreur avec détails de validation
     */
    public static ErrorResponse of(int status, String error, String message, String path,
                                   Map<String, List<String>> validationErrors) {
        return ErrorResponse.builder()
                .status(status)
                .error(error)
                .message(message)
                .path(path)
                .validationErrors(validationErrors)
                .timestamp(LocalDateTime.now())
                .build();
    }
}

