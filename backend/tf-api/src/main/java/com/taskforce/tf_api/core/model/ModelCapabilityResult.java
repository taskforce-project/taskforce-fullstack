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
import lombok.Setter;

/** La note d'un cas de capacité dans une mesure (V115), une seule fois : ce qui a été vérifié, et ce que le modèle a fait. */
@Entity
@Table(name = "model_capability_results")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ModelCapabilityResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "run_id", nullable = false, updatable = false)
    private Long runId;

    @Column(name = "case_key", nullable = false, updatable = false, length = 64)
    private String caseKey;

    @Column(nullable = false, updatable = false, length = 32)
    private String capability;

    @Column(nullable = false, updatable = false)
    private boolean passed;

    /** Le détail, en JSON : les critères notés, les appels du modèle, un extrait de sa réponse, le modèle qui a répondu. */
    @Column(nullable = false, updatable = false, columnDefinition = "TEXT")
    private String details;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /** Le temps de la réponse, en millisecondes, au banc des modèles (R131) ; null pour une mesure de capacité. */
    @Column(name = "duration_ms")
    private Long durationMs;

    /** La note retournée par une personne (R131) ; null : celle du code compte. */
    @Column(name = "person_passed")
    private Boolean personPassed;

    @Column(name = "person_id")
    private Long personId;

    @Column(name = "person_at")
    private LocalDateTime personAt;
}
