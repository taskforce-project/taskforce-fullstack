package com.taskforce.tf_api.modules.sales.dto.request;

import jakarta.validation.constraints.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO pour créer une demande de contact ENTERPRISE.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class EnterpriseInquiryRequest {

    @NotBlank(message = "Le nom complet est obligatoire")
    @Size(max = 255, message = "Le nom ne peut pas dépasser 255 caractères")
    private String fullName;

    @NotBlank(message = "L'email est obligatoire")
    @Email(message = "L'email doit être valide")
    @Size(max = 255, message = "L'email ne peut pas dépasser 255 caractères")
    private String email;

    @NotBlank(message = "La taille de l'équipe est obligatoire")
    @Pattern(regexp = "^(1-10|11-50|51-200|200\\+)$", message = "Taille d'équipe invalide")
    private String teamSize; // "1-10", "11-50", "51-200", "200+"

    @Size(max = 2000, message = "Le message ne peut pas dépasser 2000 caractères")
    private String message; // Optionnel
}
