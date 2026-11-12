package com.taskforce.tf_api.core.enums;

/**
 * À qui appartient une connexion à un outil (séance n°22, R154). {@link #PERSONAL} : à une personne, avec son propre
 * compte et ses droits dans l'outil ; c'est le défaut, et personne d'autre ne s'en sert jamais. {@link #WORKSPACE} :
 * une source qu'un propriétaire ou un administrateur marque comme partagée avec l'espace, et qui se montre comme telle.
 */
public enum ConnectionScope {
    PERSONAL,
    WORKSPACE
}
