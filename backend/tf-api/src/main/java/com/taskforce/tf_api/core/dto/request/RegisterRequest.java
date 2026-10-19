package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO pour la requête d'inscription
 * Le frontend envoie ces données, l'API Java crée le compte dans Keycloak
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RegisterRequest {

    @NotBlank(message = "Email is required")
    @Email(message = "Invalid email format")
    private String email;

    @NotBlank(message = "The password is required")
    @Size(min = 8, message = "The password must contain at least 8 characters")
    private String password;

    @NotBlank(message = "The first name is required")
    @Size(min = 2, max = 50, message = "The first name must be 2 to 50 characters long")
    private String firstName;

    @NotBlank(message = "The name is required")
    @Size(min = 2, max = 50, message = "The last name must be 2 to 50 characters long")
    private String lastName;

    /**
     * Jeton de vérification humaine, obtenu via {@code GET /api/auth/challenge} au chargement du
     * formulaire. Volontairement <b>sans contrainte de validation déclarative</b> : sa validité est
     * cryptographique, pas syntaxique, et la vérifier ici renverrait un message trompeur (« champ
     * obligatoire ») là où le vrai motif peut être « expiré » ou « soumis trop vite ».
     */
    private String challengeToken;

    /**
     * Jeton Cloudflare Turnstile ({@code cf-turnstile-response}) produit par le widget. Facultatif :
     * le serveur peut avoir Turnstile désactivé, et le défi signé ci-dessus reste alors seul en
     * place. Vérifié au niveau du contrôleur, qui dispose de l'adresse de l'appelant.
     */
    private String turnstileToken;
}
