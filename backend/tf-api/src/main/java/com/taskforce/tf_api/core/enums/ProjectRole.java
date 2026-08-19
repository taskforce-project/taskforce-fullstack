package com.taskforce.tf_api.core.enums;

/**
 * Rôle d'un membre dans un projet
 */
public enum ProjectRole {
    /** Chef de projet — droits complets sur le projet */
    LEAD,
    /** Contributeur actif */
    MEMBER,
    /** Lecture seule */
    VIEWER
}
