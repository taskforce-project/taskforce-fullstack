package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO pour la sélection du plan (Étape 2 de l'inscription)
 * Le frontend envoie l'email et le plan choisi
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SelectPlanRequest {

    @NotBlank(message = "L'email est obligatoire")
    @Email(message = "Format d'email invalide")
    private String email;

    @NotBlank(message = "Le type de plan est obligatoire")
    @Pattern(regexp = "^(FREE|PRO|PREMIUM|ENTERPRISE)$", 
             message = "Le plan doit être FREE, PRO, PREMIUM ou ENTERPRISE")
    private String planType;
}
