package com.taskforce.tf_api.core.dto.request;

import lombok.Data;

/**
 * Ré-exécute une répartition « X par Y » — utilisé pour rafraîchir un graphe épinglé (breakdown)
 * avec des données à jour. Les trois champs sont validés contre la whitelist du moteur de requête.
 */
@Data
public class BreakdownQueryRequest {

    private String dimension;   // PROJECT | STATUS | ASSIGNEE | PRIORITY | TYPE
    private String measure;     // COUNT | POINTS
    private String scope;       // ALL | OPEN | DONE
}
