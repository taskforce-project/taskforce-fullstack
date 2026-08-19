package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

/**
 * DTO pour la mise à jour du profil de l'utilisateur courant.
 * Tous les champs sont optionnels — seuls les champs non-null sont mis à jour.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UpdateUserRequest {

    @Size(max = 100, message = "Le prénom ne peut pas dépasser 100 caractères")
    private String firstName;

    @Size(max = 100, message = "Le nom ne peut pas dépasser 100 caractères")
    private String lastName;

    @Size(max = 150, message = "Le nom d'affichage ne peut pas dépasser 150 caractères")
    private String displayName;

    @Size(max = 500, message = "L'URL de l'avatar ne peut pas dépasser 500 caractères")
    private String avatarUrl;
}
