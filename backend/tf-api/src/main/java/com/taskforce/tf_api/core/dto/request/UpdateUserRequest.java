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

    @Size(max = 100, message = "The first name can't exceed 100 characters")
    private String firstName;

    @Size(max = 100, message = "The name can't exceed 100 characters")
    private String lastName;

    @Size(max = 150, message = "The display name can't exceed 150 characters")
    private String displayName;

    @Size(max = 500, message = "The avatar URL can't exceed 500 characters")
    private String avatarUrl;
}
