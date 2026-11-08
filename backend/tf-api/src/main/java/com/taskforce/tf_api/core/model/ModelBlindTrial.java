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
 * Un essai à l'aveugle (V121, R131) : une issue de la personne, une tâche, deux ou trois modèles sous des lettres. Il n'appartient
 * qu'à elle : une réponse tirée d'une vraie issue n'est visible que de la personne qui l'a lancée.
 */
@Entity
@Table(name = "model_blind_trials")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ModelBlindTrial {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workspace_id", nullable = false, updatable = false)
    private Long workspaceId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private Long userId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private Long projectId;

    @Column(name = "issue_id", nullable = false, updatable = false)
    private Long issueId;

    @Column(name = "issue_key", nullable = false, updatable = false, length = 64)
    private String issueKey;

    @Column(nullable = false, updatable = false, length = 32)
    private String task;

    @Column(name = "started_at", nullable = false, updatable = false)
    private LocalDateTime startedAt;

    /** Quand la personne a choisi ; null tant qu'elle n'a pas choisi. */
    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    /** La lettre choisie ; null quand elle n'en a retenu aucune. */
    @Column(name = "chosen_letter", length = 1)
    private String chosenLetter;
}
