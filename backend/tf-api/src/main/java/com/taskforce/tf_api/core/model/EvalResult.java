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

/** La note d'un cas dans un rejeu (V108), une seule fois : chaque critère, les appels faits, la réponse, le modèle. */
@Entity
@Table(name = "eval_results")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvalResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "run_id", nullable = false, updatable = false)
    private Long runId;

    @Column(name = "case_id", nullable = false, updatable = false)
    private Long caseId;

    @Column(nullable = false, updatable = false)
    private boolean passed;

    /** Le détail, en JSON : les critères notés, les appels du modèle, un extrait de sa réponse, le modèle qui a répondu. */
    @Column(nullable = false, updatable = false, columnDefinition = "TEXT")
    private String details;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
