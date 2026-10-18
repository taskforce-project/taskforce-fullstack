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
 * DTO pour la réinitialisation du mot de passe
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResetPasswordRequest {

    @NotBlank(message = "Email is required")
    @Email(message = "Invalid email format")
    private String email;

    @NotBlank(message = "The OTP code is required")
    @Size(min = 6, max = 6, message = "The code must be 6 characters")
    @Pattern(regexp = "^[0-9]{6}$", message = "The code must be 6 digits")
    private String otpCode;

    @NotBlank(message = "The new password is required")
    @Size(min = 8, message = "The password must contain at least 8 characters")
    private String newPassword;
}
