package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.EvalRun;

@Repository
public interface EvalRunRepository extends JpaRepository<EvalRun, Long> {

    List<EvalRun> findTop10ByWorkspaceIdOrderByStartedAtDesc(Long workspaceId);

    /** Les rejeux que l'histoire de la banque montre (R125) : les cent derniers, de quoi tracer une courbe. */
    List<EvalRun> findTop100ByWorkspaceIdOrderByStartedAtDesc(Long workspaceId);

    Optional<EvalRun> findByIdAndWorkspaceId(Long id, Long workspaceId);
}
