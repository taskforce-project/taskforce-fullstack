package com.taskforce.tf_api.core.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO de réponse après authentification (login ou register)
 * Contient les tokens JWT et les informations utilisateur
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse {

    private String accessToken;
    private String refreshToken;

    @Builder.Default
    private String tokenType = "Bearer";

    private Long expiresIn; // Durée de validité du token en secondes
    private UserResponse user;

    /**
     * Vrai quand le mot de passe est correct mais qu'un code 2FA est requis pour finir la connexion :
     * dans ce cas AUCUN token n'est émis, le front affiche l'étape « code » et rejoue le login avec `totp`.
     */
    private Boolean twoFactorRequired;
}
