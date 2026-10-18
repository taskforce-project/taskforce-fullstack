package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Corps de la requête POST /api/workspaces/{slug}/projects
 */
@Data
public class CreateProjectRequest {

    @NotBlank(message = "The project name is required")
    @Size(min = 1, max = 150, message = "The name must be 1 to 150 characters long")
    private String name;

    /**
     * Identifiant court unique dans le workspace (ex: "WEB", "API-V2").
     * Lettres majuscules, chiffres et tirets, 2–10 caractères.
     */
    @NotBlank(message = "The identifier is required")
    @Size(min = 2, max = 10, message = "The identifier must be 2 to 10 characters long")
    @Pattern(regexp = "^[A-Z0-9][A-Z0-9-]*$", message = "The identifier can only contain uppercase letters, digits and hyphens")
    private String identifier;

    @Size(max = 1000, message = "The description can't exceed 1000 characters")
    private String description;

    /** true = visible par tous les membres du workspace, false = membres explicites seulement */
    private boolean isPublic = false;

    /** URL de l'icône/logo (image uploadée, emoji unicode ou lucide:IconName). Optionnel. */
    private String iconUrl;

    /** Couleur d'accent (classe Tailwind, ex: "bg-violet-500"). Optionnel. */
    @Size(max = 50, message = "The color can't exceed 50 characters")
    private String color;
}
