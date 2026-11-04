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

/**
 * Une mesure de ce que sait faire un modèle (V115, R113) : les cas fixes d'une version de la suite, rejoués sur ce modèle.
 * L'espace et la personne qui l'ont lancée portent son coût (quota, frein de débit) ; la table, elle, vaut pour l'instance.
 */
@Entity
@Table(name = "model_capability_runs")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ModelCapabilityRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workspace_id", nullable = false, updatable = false)
    private Long workspaceId;

    @Column(name = "started_by", updatable = false)
    private Long startedBy;

    @Column(name = "started_at", nullable = false, updatable = false)
    private LocalDateTime startedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    @Column(nullable = false, updatable = false, length = 128)
    private String model;

    @Column(name = "suite_version", nullable = false, updatable = false)
    private int suiteVersion;

    @Column(nullable = false, updatable = false)
    private int total;

    @Column(nullable = false)
    private int passed;
}
