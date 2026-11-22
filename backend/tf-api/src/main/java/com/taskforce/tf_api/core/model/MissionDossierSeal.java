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
 * Un sceau du dossier d'une mission : la tête de sa chaîne à ce rang, signée (une enveloppe DSSE d'un énoncé in-toto,
 * {@code EvidenceSeal}). Un par état scellé, jamais réécrit ; le dernier couvre tout le dossier.
 */
@Entity
@Table(name = "mission_dossier_seals")
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MissionDossierSeal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "run_id", nullable = false, updatable = false)
    private Long runId;

    /** Le rang du dernier événement scellé. */
    @Column(nullable = false, updatable = false)
    private Integer seq;

    @Column(nullable = false, updatable = false, length = 71)
    private String root;

    @Column(name = "sealed_at", nullable = false, updatable = false, length = 32)
    private String sealedAt;

    @Column(name = "key_id", nullable = false, updatable = false, length = 71)
    private String keyId;

    /** L'enveloppe DSSE, en JSON. */
    @Column(nullable = false, updatable = false, columnDefinition = "TEXT")
    private String envelope;
}
