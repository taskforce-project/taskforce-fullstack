package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Clôture du parcours d'onboarding. Le rôle est optionnel : le drapeau
 * {@code onboarding_completed} est levé quoi qu'il arrive, l'utilisateur pouvant sauter l'étape.
 */
@Data
public class CompleteOnboardingRequest {

    @Size(max = 150, message = "The role can't exceed 150 characters")
    private String jobTitle;
}
