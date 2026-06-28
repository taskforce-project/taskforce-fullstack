package com.taskforce.tf_api.core.enums;

/** Type de relation orientée entre deux nodes du graphe de connaissance. */
public enum EdgeRelation {
    RELATES_TO,
    SUPERSEDES,    // remplace (versioning : v2 supersedes v1)
    CAUSED_BY,
    DECISION_OF,
    DEPENDS_ON,
    IMPLEMENTS,
    REFERENCES
}
