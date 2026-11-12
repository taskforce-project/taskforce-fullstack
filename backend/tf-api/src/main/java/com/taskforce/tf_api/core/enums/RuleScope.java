package com.taskforce.tf_api.core.enums;

/**
 * Les couches des règles de l'entreprise (R157, séance n°22), au-dessus de la table de TaskForce : chacune ne fait que
 * durcir celle du dessous. Dans un paquet, elles se jugent de la plus précise (la personne) à la plus large
 * (l'organisation). Le nom en minuscules est celui du contrat ({@code layer} d'une règle).
 */
public enum RuleScope {
    /** L'organisation : tout l'espace. */
    WORKSPACE,
    /** Un projet de l'espace. */
    PROJECT,
    /** Un processus de l'espace (TF-J2-2), par sa clé. */
    PROCESS,
    /** Un rôle de l'espace : ce que font les personnes qui l'ont, et leurs agents. */
    ROLE,
    /** Une personne de l'espace : ce qu'elle fait, et ses agents. */
    PERSON;

    /** Le nom du contrat, {@code workspace}, {@code project}... */
    public String layer() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }
}
