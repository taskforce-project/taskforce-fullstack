package com.taskforce.tf_api.core.enums;

/**
 * Le geste de la personne sur la carte de résultat d'une mission (R78, séance n°13) : appliquer (la pull request
 * fusionnée), écarter (fermée, sa branche supprimée), relancer (écartée, puis une nouvelle mission), ou terminer l'issue
 * quand la mission n'a rien changé, le travail étant déjà fait (rejeu de la 1.8.0, 02/11/2026).
 */
public enum DeliveryRunOutcome {
    APPLIED,
    DISCARDED,
    RETRIED,
    /** L'issue terminée sans changement : ni pull request ni commit, rien à appliquer. */
    MARKED_DONE
}
