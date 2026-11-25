package com.taskforce.tf_api.core.model;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;

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
 * hasard la première fois, jamais son courriel ni son nom, qui vivent à côté de la chaîne et s'effacent. Un par
 * personne et par espace (R159, second tour, L-a) : stable dans l'espace, et rien ne relie ceux d'une même personne
 * d'un espace à l'autre. Le paquet de règles nomme ainsi qui répond de chaque règle, pour que le dossier le garde tel
 * que le runner l'a reçu. La ligne part quand son compte est purgé : l'identifiant reste dans les chaînes et dans les
 * versions des règles, plus rien ne le relie à elle.
 */
@Entity
@Table(name = "mission_people")
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MissionPerson {

    /**
     * Le préfixe des identifiants opaques, distinct de {@code person:<id>} des règles vivantes (R159, second tour,
     * L-e) : le dossier nomme ainsi chaque personne, et le paquet de règles celle qui répond d'une règle ; une règle
     * désigne ceux qui peuvent accorder par {@code person:<id>}.
     */
    public static final String PREFIX = "who:";

    private static final SecureRandom RANDOM = new SecureRandom();

    /** Un identifiant neuf pour cette personne dans cet espace : {@code who:} et 128 bits tirés au hasard. */
    public static MissionPerson draw(Long workspaceId, Long userId) {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        return MissionPerson.builder().workspaceId(workspaceId).userId(userId)
            .person(PREFIX + HexFormat.of().formatHex(bytes)).createdAt(LocalDateTime.now()).build();
    }

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
