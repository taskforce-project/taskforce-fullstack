package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * L'identifiant opaque sous lequel une personne entre dans les dossiers des missions d'un espace (R159, M6) : tiré au
 * hasard la première fois, jamais son courriel ni son nom, qui vivent à côté de la chaîne et s'effacent. Un par personne
 * et par espace (R159, second tour, L-a) : stable dans l'espace, et rien ne relie ceux d'une même personne d'un espace à
 * l'autre. La ligne part quand son compte est purgé : l'identifiant reste dans les chaînes, plus rien ne le relie à elle.
 */
@Entity
@Table(name = "mission_people")
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MissionPerson {

    /** Le préfixe des identifiants opaques du dossier, distinct de {@code person:<id>} des règles vivantes (R159, second tour, L-e). */
    public static final String PREFIX = "who:";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workspace_id", nullable = false, updatable = false)
    private Long workspaceId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private Long userId;

    /** {@code who:} et 32 chiffres hexadécimaux. */
    @Column(nullable = false, unique = true, length = 48, updatable = false)
    private String person;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
