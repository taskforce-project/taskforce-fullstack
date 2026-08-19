package com.taskforce.tf_api.core.enums;

/**
 * Types d'actions loggées dans issue_activity.
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
    REOPENED
}
