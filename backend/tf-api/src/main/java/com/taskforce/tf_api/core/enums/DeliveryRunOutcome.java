package com.taskforce.tf_api.core.enums;

/**
 * Le geste de la personne sur la carte de résultat d'une mission (R78, séance n°13) : appliquer (la pull request
 * fusionnée), écarter (fermée, sa branche supprimée), relancer (écartée, puis une nouvelle mission), ou terminer l'issue
 * quand la mission n'a rien changé, le travail étant déjà fait (rejeu de la 1.8.0, 02/11/2026). {@code STOPPED} n'est pas
 * un geste sur un résultat : la personne a arrêté la mission pendant le travail (R138, séance n°20).
 */
public enum DeliveryRunOutcome {
    APPLIED,
    DISCARDED,
    RETRIED,
    /** L'issue terminée sans changement : ni pull request ni commit, rien à appliquer. */
    MARKED_DONE,
    /** La personne a commenté des lignes : une reprise continue la même branche (R139, séance n°20). */
    FOLLOWED_UP,
    /** Arrêtée par la personne qui l'a déléguée, avant d'avoir rendu : FAILED pour la file, mais pas une panne. */
    STOPPED
}
