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

    @NotBlank(message = "Le nom du projet est obligatoire")
    @Size(min = 1, max = 150, message = "Le nom doit contenir entre 1 et 150 caractères")
    private String name;

    /**
     * Identifiant court unique dans le workspace (ex: "WEB", "API-V2").
     * Lettres majuscules, chiffres et tirets, 2–10 caractères.
     */
    @NotBlank(message = "L'identifiant est obligatoire")
    @Size(min = 2, max = 10, message = "L'identifiant doit contenir entre 2 et 10 caractères")
    @Pattern(regexp = "^[A-Z0-9][A-Z0-9-]*$", message = "L'identifiant ne peut contenir que des lettres majuscules, chiffres et tirets")
    private String identifier;

    @Size(max = 1000, message = "La description ne peut pas dépasser 1000 caractères")
    private String description;

    /** true = visible par tous les membres du workspace, false = membres explicites seulement */
    private boolean isPublic = false;

    /** URL de l'icône/logo (image uploadée, emoji unicode ou lucide:IconName). Optionnel. */
    private String iconUrl;

    /** Couleur d'accent (classe Tailwind, ex: "bg-violet-500"). Optionnel. */
    @Size(max = 50, message = "La couleur ne peut pas dépasser 50 caractères")
    private String color;
}
