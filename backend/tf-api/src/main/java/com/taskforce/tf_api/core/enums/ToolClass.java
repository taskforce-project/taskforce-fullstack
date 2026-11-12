package com.taskforce.tf_api.core.enums;

/**
 * Ce que fait un outil d'un serveur MCP connecté, décidé par TaskForce et non par le serveur (séance n°22, R158) :
 * la classe vient du préréglage ; un outil qu'il ne nomme pas est une écriture, et TaskForce demande, quoi que le
 * serveur déclare de lui-même ({@code readOnlyHint}).
 */
public enum ToolClass {
    READ,
    WRITE;

    public boolean reads() {
        return this == READ;
    }
}
