package com.taskforce.tf_api.core.enums;

/**
 * Ce que TaskForce demande au runner hors d'une mission à réclamer (R139, R140, séance n°20) : remettre un fichier comme
 * avant la mission, ou passer à l'agent une correction tapée pendant son travail.
 */
public enum DeliveryCommandKind {
    REVERT_FILE,
    CORRECTION
}
