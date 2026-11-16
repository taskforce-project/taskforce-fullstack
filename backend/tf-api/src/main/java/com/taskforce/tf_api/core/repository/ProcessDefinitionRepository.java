package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.ProcessDefinition;

public interface ProcessDefinitionRepository extends JpaRepository<ProcessDefinition, Long> {

    /** Les processus d'un projet, dans l'ordre où ils sont nés. */
    List<ProcessDefinition> findByProjectIdOrderByCreatedAtAscIdAsc(Long projectId);

    Optional<ProcessDefinition> findByProjectIdAndProcessKey(Long projectId, String processKey);
}
