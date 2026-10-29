package com.taskforce.tf_api.core.model;

import java.time.LocalDate;
import java.time.LocalDateTime;
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
import lombok.Setter;

/**
 * Un cas de la banque d'évaluations d'un espace (V108) : figé au moment où la personne l'a confirmé. La question,
 * sa date, les notes servies ce jour-là, ce que les outils de lecture ont rendu (la cassette) et les critères, en JSON,
 * datés par {@code criteriaAt} avant tout rejeu.
 */
@Entity
@Table(name = "eval_cases")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvalCase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workspace_id", nullable = false, updatable = false)
    private Long workspaceId;

    @Column(name = "created_by", updatable = false)
    private Long createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "criteria_at", nullable = false, updatable = false)
    private LocalDateTime criteriaAt;

    @Column(name = "source_record", updatable = false)
    private UUID sourceRecord;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, updatable = false, columnDefinition = "TEXT")
    private String question;

    @Column(name = "asked_on", nullable = false, updatable = false)
    private LocalDate askedOn;

    /** Les notes servies à la question, en JSON : {@code [{title, domain, content}]}. */
    @Column(nullable = false, updatable = false, columnDefinition = "TEXT")
    private String notes;

    /** Ce que les outils de lecture ont rendu, en JSON : {@code [{tool, arguments, output}]}, arguments canoniques. */
    @Column(nullable = false, updatable = false, columnDefinition = "TEXT")
    private String cassette;

    /** Les critères, en JSON (voir {@code EvalCriteria}). */
    @Column(nullable = false, updatable = false, columnDefinition = "TEXT")
    private String criteria;

    @Column(nullable = false)
    private boolean archived;
}
