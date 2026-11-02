package com.taskforce.tf_api.core.enums;

/**
 * Types d'actions loggées dans issue_activity. Les valeurs suivent le type PostgreSQL {@code issue_activity_type} :
 * une valeur ajoutée ici l'est aussi par une migration ({@code ALTER TYPE ... ADD VALUE}).
 */
public enum IssueActivityType {
    CREATED,
    STATUS_CHANGED,
    PRIORITY_CHANGED,
    ASSIGNEE_CHANGED,
    TYPE_CHANGED,
    TITLE_CHANGED,
    DESCRIPTION_CHANGED,
    LABEL_ADDED,
    LABEL_REMOVED,
    DUE_DATE_CHANGED,
    START_DATE_CHANGED,
    PARENT_CHANGED,
    COMMENT_ADDED,
    COMMENT_DELETED,
    COMPLETED,
    REOPENED,
    /** Une ligne de la checklist cochée ({@code new_value} : son texte). */
    CHECKLIST_CHECKED,
    /** Une ligne de la checklist décochée ({@code new_value} : son texte). */
    CHECKLIST_UNCHECKED,
    /** La pull request d'une mission liée à l'issue ({@code new_value} : son adresse). */
    PULL_REQUEST_OPENED,
    /** Les trois gestes de la carte de résultat d'une mission (R78) : appliquer, écarter, relancer. */
    MISSION_APPLIED,
    MISSION_DISCARDED,
    MISSION_RETRIED
}
