package com.taskforce.tf_api.core.enums;

/**
 * L'état d'une connexion tel que la personne le voit (séance n°22, R154) : branchée, à reconnecter (le jeton ne se
 * renouvelle plus), en attente de l'administrateur (l'éditeur exige son accord ou son application).
 */
public enum ConnectionState {
    CONNECTED,
    NEEDS_RECONNECT,
    WAITING_FOR_ADMIN
}
