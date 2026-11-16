package com.taskforce.tf_api.core.model;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * L'objectif d'un projet (la vue du workflow, lot W1, V133) : le but en une phrase, une date visée si l'on veut, d'un à
 * cinq critères de réussite. Un projet en a un ou aucun : la clé est l'identifiant du projet, et retirer l'objectif
 * supprime la ligne.
 */
@Entity
@Table(name = "project_objectives")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectObjective {

    /** Le projet de l'objectif, qui en est aussi la clé. */
    @Id
    @Column(name = "project_id")
    private Long projectId;

    /** Le but, en une phrase. */
    @Column(nullable = false, length = 280)
    private String goal;

    /** La date visée ; null quand le projet n'en a pas. */
    @Column(name = "target_date")
    private LocalDate targetDate;

    /** Les critères de réussite, d'un à cinq (une contrainte de la table le garde). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "criteria", nullable = false, columnDefinition = "jsonb")
    private List<String> criteria;

    /** Qui l'a posé ou changé en dernier ; null quand cette personne n'existe plus. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updated_by")
    private User updatedBy;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
