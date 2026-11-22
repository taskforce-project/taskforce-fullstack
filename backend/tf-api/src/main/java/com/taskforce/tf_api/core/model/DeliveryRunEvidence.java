package com.taskforce.tf_api.core.model;

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
 * Un événement du dossier de preuve d'une mission (spécification de la v2, §9 ; contracts/evidence), ajouté et jamais
 * modifié. {@code at} et {@code data} sont gardés tels qu'ils entrent dans l'empreinte : texte ISO-8601 et JSON
 * canonique. Pas d'audit Spring : un événement n'a ni auteur technique ni mise à jour, son acteur fait partie du contenu.
 *
 * <p>Il pend au dossier de la mission ({@link MissionDossier}), pas à la mission : une issue supprimée emporte sa
 * mission, jamais son dossier (V135). La base refuse de le modifier ou de l'effacer seul.</p>
 */
@Entity
@Table(name = "delivery_run_evidence")
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeliveryRunEvidence {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** La mission du dossier : un identifiant, plus une relation, puisque la mission peut ne plus exister. */
    @Column(name = "run_id", nullable = false, updatable = false)
    private Long runId;

    @Column(nullable = false, updatable = false)
    private Integer seq;

    @Column(nullable = false, updatable = false, length = 32)
    private String at;

    /** Un type de {@code contracts/evidence/taskforce-evidence-1.schema.json} : {@code mission.started}, {@code action.decided}... */
    @Column(nullable = false, updatable = false, length = 32)
    private String type;

    /** {@code agent}, {@code person}, {@code rule}, {@code runner} ou {@code server}. */
    @Column(name = "actor_kind", nullable = false, updatable = false, length = 16)
    private String actorKind;

    @Column(name = "actor_id", nullable = false, updatable = false, length = 255)
    private String actorId;

    /** Contenu de l'événement, en JSON canonique. */
    @Column(nullable = false, updatable = false, columnDefinition = "TEXT")
    private String data;

    @Column(nullable = false, updatable = false, length = 71)
    private String prev;

    @Column(nullable = false, updatable = false, length = 71)
    private String hash;
}
