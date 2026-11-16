package com.taskforce.tf_api.core.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.ProjectObjective;

/** L'objectif d'un projet, rangé sous l'identifiant du projet (V133). */
public interface ProjectObjectiveRepository extends JpaRepository<ProjectObjective, Long> {
}
