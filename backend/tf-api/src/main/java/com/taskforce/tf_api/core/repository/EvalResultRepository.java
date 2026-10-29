package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.EvalResult;

@Repository
public interface EvalResultRepository extends JpaRepository<EvalResult, Long> {

    Optional<EvalResult> findByRunIdAndCaseId(Long runId, Long caseId);

    List<EvalResult> findByRunIdOrderByIdAsc(Long runId);

    long countByRunId(Long runId);

    long countByRunIdAndPassedTrue(Long runId);
}
