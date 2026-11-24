package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * L'identifiant opaque et stable sous lequel une personne entre dans les dossiers des missions (R159, M6) : tiré au
 * hasard la première fois, jamais son courriel ni son nom, qui vivent à côté de la chaîne et s'effacent. La ligne part
 * quand son compte est purgé : l'identifiant reste dans les chaînes, plus rien ne le relie à la personne.
 */
@Entity
@Table(name = "mission_people")
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MissionPerson {

    @Id
    @Column(name = "user_id")
    private Long userId;

    /** {@code person:} et 32 chiffres hexadécimaux. */
    @Column(nullable = false, unique = true, length = 48, updatable = false)
    private String person;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
