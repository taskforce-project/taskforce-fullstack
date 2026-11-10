package com.taskforce.tf_api.core.service.ai;

/** La personne a arrêté ce tour (R134) : rien ne va plus au modèle. Ce n'est pas une panne : l'IA reste disponible. */
public class TurnStoppedException extends RuntimeException {

    public TurnStoppedException() {
        super("Stopped by the person", null, false, false);
    }
}
