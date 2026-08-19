package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Mise à jour partielle d'un item de checklist : null = champ inchangé.
 */
@Data
public class UpdateChecklistItemRequest {

    @Size(max = 500, message = "500 caractères maximum")
    private String content;

    private Boolean done;

    private Integer position;
}
