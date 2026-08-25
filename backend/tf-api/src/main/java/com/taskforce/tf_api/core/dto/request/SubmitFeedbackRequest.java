package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Envoi d'un retour utilisateur depuis l'app (bouton « Give feedback »).
 */
@Data
public class SubmitFeedbackRequest {

    /** BUG | IDEA | OTHER (défaut OTHER si absent). */
    @Pattern(regexp = "BUG|IDEA|OTHER", message = "Catégorie invalide")
    private String category;

    @NotBlank(message = "Le message est requis")
    @Size(max = 5000, message = "5000 caractères maximum")
    private String message;

    /** Page / fonctionnalité d'origine (ex. « Labs · Intelligence »). */
    @Size(max = 255, message = "Contexte trop long")
    private String context;
}
