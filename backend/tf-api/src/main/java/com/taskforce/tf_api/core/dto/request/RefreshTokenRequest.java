package com.taskforce.tf_api.core.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO pour rafraîchir le token d'accès.
 *
 * <p>Le refresh token provient désormais d'un cookie {@code HttpOnly} (voir {@code RefreshTokenCookie})
 * et n'est donc plus obligatoire dans le corps. Le champ reste accepté en repli pour les sessions
 * créées avant la migration (transition sans déconnexion) — cf. AuthController.refreshToken.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RefreshTokenRequest {

    private String refreshToken;
}
