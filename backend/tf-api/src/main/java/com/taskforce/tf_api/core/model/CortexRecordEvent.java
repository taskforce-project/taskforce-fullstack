package com.taskforce.tf_api.core.model;

import java.util.UUID;

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
 * Un événement du dossier d'une réponse de Cortex (V107), ajouté et jamais modifié, chaîné comme ceux d'une mission
 * ({@link DeliveryRunEvidence}) : {@code at} et {@code data} sont gardés tels qu'ils entrent dans l'empreinte.
 */
@Entity
@Table(name = "cortex_record_events")
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CortexRecordEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "record_id", nullable = false, updatable = false)
    private UUID recordId;

    @Column(nullable = false, updatable = false)
    private Integer seq;

    @Column(nullable = false, updatable = false, length = 32)
    private String at;

    /** Un type de {@code contracts/evidence/taskforce-evidence-1.schema.json} : {@code action.decided}... */
    @Column(nullable = false, updatable = false, length = 32)
    private String type;

    /** {@code agent} (Cortex), {@code person}, {@code rule} ou {@code server}. */
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
