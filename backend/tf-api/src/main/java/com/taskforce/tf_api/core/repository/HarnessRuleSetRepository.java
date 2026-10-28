package com.taskforce.tf_api.core.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.HarnessRuleSet;

public interface HarnessRuleSetRepository extends JpaRepository<HarnessRuleSet, Long> {

    /** La version en vigueur des règles d'un espace : la plus récente. */
    Optional<HarnessRuleSet> findFirstByWorkspaceIdOrderByVersionDesc(Long workspaceId);
}
