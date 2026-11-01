package com.taskforce.tf_api.core.enums;

/**
 * Le geste de la personne sur la carte de résultat d'une mission (R78, séance n°13) : appliquer (la pull request
 * fusionnée), écarter (fermée, sa branche supprimée), ou relancer (écartée, puis une nouvelle mission).
 */
public enum DeliveryRunOutcome {
    APPLIED,
    DISCARDED,
    RETRIED
}
