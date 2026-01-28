package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO pour la vérification du code OTP
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VerifyOtpRequest {

    @NotBlank(message = "L'email est obligatoire")
    @Email(message = "Format d'email invalide")
    private String email;

    @NotBlank(message = "Le code OTP est obligatoire")
    @Size(min = 6, max = 6, message = "Le code OTP doit contenir 6 caractères")
    @Pattern(regexp = "^[0-9]{6}$", message = "Le code OTP doit être composé de 6 chiffres")
    private String otpCode;
}
