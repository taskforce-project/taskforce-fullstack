package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.HarnessRuleSet;

public interface HarnessRuleSetRepository extends JpaRepository<HarnessRuleSet, Long> {

    /** La dernière version écrite dans l'espace, toutes couches confondues : la suivante prend son numéro plus un. */
    Optional<HarnessRuleSet> findFirstByWorkspaceIdOrderByVersionDesc(Long workspaceId);

    /**
     * Toutes les versions des couches d'un espace, la plus récente d'abord : la version en vigueur d'une couche est la
     * première de sa couche dans cette liste. Un espace en écrit peu ; le paquet de chaque mission en dépend.
     */
    List<HarnessRuleSet> findByWorkspaceIdOrderByVersionDesc(Long workspaceId);
}
