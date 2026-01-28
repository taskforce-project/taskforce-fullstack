package com.taskforce.tf_api.core.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO de réponse après l'inscription (avant vérification OTP)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RegisterResponse {

    private String message;
    private String email;
    private Boolean otpSent;
    private Integer otpExpiresInMinutes;
}
