package com.taskforce.tf_api.modules.transfer.service;

/**
 * Qui tient, dans cette instance, la place d'une personne citée par un fichier de projet (auteur d'un commentaire,
 * personne assignée, rapporteur). La règle dépend du côté : le serveur ne crée jamais de compte, l'app desktop garde
 * le nom des autres personnes sans leur ouvrir l'app.
 */
public interface ImportedPeople {

    /**
     * @param email       adresse de la personne dans le fichier, ou {@code null}
     * @param displayName nom affiché de la personne dans le fichier, ou {@code null}
     * @param importerId  personne qui importe
     * @param workspaceId espace qui reçoit le projet
     * @return l'utilisateur de cette instance à citer à sa place
     */
    Long resolve(String email, String displayName, Long importerId, Long workspaceId);
}
