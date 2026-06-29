package com.taskforce.tf_api.modules.ged.dto.response;

/**
 * Réponse d'upload d'un fichier Brain OS (image ou document) vers MinIO.
 * {@code url} est le chemin de service (proxy public par UUID) à insérer dans le markdown.
 */
public record BrainFileResponse(
    String url,
    String filename,
    String contentType,
    long size,
    boolean image
) {}
