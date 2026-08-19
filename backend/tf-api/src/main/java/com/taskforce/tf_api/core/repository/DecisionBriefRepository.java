package com.taskforce.tf_api.core.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.DecisionBriefEntity;

public interface DecisionBriefRepository extends JpaRepository<DecisionBriefEntity, Long> {

    /** Dernier brief produit pour un projet (celui qu'affiche la page Analytics). */
    Optional<DecisionBriefEntity> findFirstByProjectIdOrderByCreatedAtDesc(Long projectId);
}
