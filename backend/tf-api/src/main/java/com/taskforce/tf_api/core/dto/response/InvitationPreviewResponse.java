package com.taskforce.tf_api.core.dto.response;

import com.taskforce.tf_api.core.enums.WorkspaceRole;

import lombok.Builder;
import lombok.Data;

/**
 * Vue publique d'une invitation résolue par token (pré-remplissage de la page d'inscription, PROD-3.5).
 * Ne fuite aucune donnée sensible — juste de quoi afficher l'accueil et pré-remplir l'email.
 */
@Data
@Builder
public class InvitationPreviewResponse {

    private String email;
    private String workspaceName;
    private WorkspaceRole role;
    private boolean valid;
    /** true si l'email a déjà un compte Taskforce (le front peut router vers login). */
    private boolean accountExists;
}
