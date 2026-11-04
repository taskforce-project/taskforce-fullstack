package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Le modèle que la personne a choisi pour Cortex dans la webapp (V115, R113) ; sans ligne, celui de l'instance. */
@Entity
@Table(name = "ai_model_choices")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiModelChoice {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false, length = 128)
    private String model;

    @Column(name = "chosen_at", nullable = false)
    private LocalDateTime chosenAt;
}
