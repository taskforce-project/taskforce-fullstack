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
import lombok.Setter;

/** Une réponse d'un essai à l'aveugle (V121) : sa lettre, son modèle, tiré par le serveur, et ce qu'il a répondu ; null tant qu'il n'a pas répondu. */
@Entity
@Table(name = "model_blind_trial_answers")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ModelBlindTrialAnswer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "trial_id", nullable = false, updatable = false)
    private Long trialId;

    @Column(nullable = false, updatable = false, length = 1)
    private String letter;

    @Column(nullable = false, updatable = false, length = 128)
    private String model;

    @Column(columnDefinition = "TEXT")
    private String answer;

    @Column(name = "duration_ms")
    private Long durationMs;
}
