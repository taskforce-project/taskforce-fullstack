package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Demande de validation d'une action de l'agent, ouverte par le runner local (OSS-5.4).
 *
 * @param tool    outil (« Bash », « WebFetch »)
 * @param summary ce que l'action ferait (commande, fichier, adresse) ; tronqué à 2000 caractères au stockage
 */
public record RunnerApprovalRequest(
    @NotBlank @Size(max = 120)
    String tool,

    @NotBlank @Size(max = 4000)
    String summary
) {}
