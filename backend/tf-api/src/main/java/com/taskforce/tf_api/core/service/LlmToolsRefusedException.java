package com.taskforce.tf_api.core.service;

/**
 * Le fournisseur d'IA répond, mais refuse les outils, jusqu'au dernier (l'ai-service rend 422). L'agent ne doit pas
 * répondre comme s'il en avait : sans outils, le modèle annonçait des actions qu'il n'avait pas faites (recette du
 * 29/10/2026). Ce n'est pas une panne du fournisseur, dont l'état reste valable.
 */
public class LlmToolsRefusedException extends RuntimeException {

    public LlmToolsRefusedException(String message, Throwable cause) {
        super(message, cause);
    }
}
