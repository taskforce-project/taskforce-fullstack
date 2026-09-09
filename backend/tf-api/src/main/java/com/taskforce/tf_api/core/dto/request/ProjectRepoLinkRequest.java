package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Corps de PUT /api/workspaces/{slug}/projects/{id}/repo — lie un dépôt de code au projet
 * (TF-AGENT-DELIVERY, slice 1). Deux modes :
 * <ul>
 *   <li>{@code CREATE} : crée un nouveau dépôt GitHub ({@code repoName}) sur le compte connecté.</li>
 *   <li>{@code LINK}   : lie un dépôt existant ({@code repoFullName} = "owner/name").</li>
 * </ul>
 */
@Data
public class ProjectRepoLinkRequest {

    @NotBlank(message = "Le mode est obligatoire (CREATE ou LINK)")
    private String mode;

    /** Mode CREATE : nom du dépôt à créer (le propriétaire = le compte GitHub connecté). */
    private String repoName;

    /** Mode LINK : dépôt existant au format "owner/name". */
    private String repoFullName;

    /** Mode CREATE : dépôt privé (défaut true). */
    private boolean privateRepo = true;
}
