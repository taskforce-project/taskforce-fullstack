package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Clôture du parcours d'onboarding. Le rôle est optionnel : le drapeau
 * {@code onboarding_completed} est levé quoi qu'il arrive, l'utilisateur pouvant sauter l'étape.
 */
@Data
public class CompleteOnboardingRequest {

    @Size(max = 150, message = "Le rôle ne peut dépasser 150 caractères")
    private String jobTitle;
}
