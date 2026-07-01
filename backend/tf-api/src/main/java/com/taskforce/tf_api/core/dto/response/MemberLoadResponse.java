package com.taskforce.tf_api.core.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Charge ouverte d'un membre concerné par un plan de redistribution (PROD-1.12) :
 * nombre de tâches ouvertes avant / après application du plan.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MemberLoadResponse {

    private Long userId;
    private String name;
    private int openBefore;
    private int openAfter;
    /** true si le membre dépassait le seuil avant redistribution. */
    private boolean overloaded;
}
