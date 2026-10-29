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

/** Un rejeu de la banque avec un modèle nommé (V108) : {@code total} compte les cas actifs au départ. */
@Entity
@Table(name = "eval_runs")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvalRun {

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

    @Column(nullable = false, updatable = false)
    private int total;

    @Column(nullable = false)
    private int passed;
}
