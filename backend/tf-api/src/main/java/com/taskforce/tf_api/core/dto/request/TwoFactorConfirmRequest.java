package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Code à 6 chiffres saisi pour confirmer l'activation du 2FA (ou le désactiver). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TwoFactorConfirmRequest {

    @NotBlank(message = "The code is required")
    @Pattern(regexp = "\\d{6}", message = "The code must be 6 digits")
    private String code;
}
