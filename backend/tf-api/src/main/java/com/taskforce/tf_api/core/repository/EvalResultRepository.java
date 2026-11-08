package com.taskforce.tf_api.core.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.EvalResult;

@Repository
public interface EvalResultRepository extends JpaRepository<EvalResult, Long> {

    /** Une note telle que l'histoire de la banque la lit (R125) : sans son détail. */
    interface Row {
        Long getRunId();
        Long getCaseId();
        Boolean getPassed();
    }

    Optional<EvalResult> findByRunIdAndCaseId(Long runId, Long caseId);

    List<EvalResult> findByRunIdOrderByIdAsc(Long runId);

    /** Les notes de ces rejeux, sans leur détail. */
    List<Row> findRowsByRunIdIn(Collection<Long> runIds);

    /** La première note d'un rejeu : elle dit quel modèle a répondu quand le rejeu n'en nommait pas. */
    Optional<EvalResult> findFirstByRunIdOrderByIdAsc(Long runId);

    long countByRunId(Long runId);

    long countByRunIdAndPassedTrue(Long runId);
}
