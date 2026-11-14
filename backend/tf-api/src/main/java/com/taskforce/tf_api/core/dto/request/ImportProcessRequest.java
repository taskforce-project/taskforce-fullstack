package com.taskforce.tf_api.core.dto.request;

import com.taskforce.tf_api.core.process.BpmnImport;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Un fichier BPMN 2.0 à lire dans le modèle des processus (ADR-027) : son texte. Rien n'est publié ; la réponse dit ce
 * que le fichier donne, et ce que le vérificateur en refuse.
 */
public record ImportProcessRequest(
    @NotBlank @Size(max = BpmnImport.MAX_CHARS)
    String xml
) {
}
