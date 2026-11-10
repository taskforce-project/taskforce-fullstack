package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.ModelCapabilityResult;

@Repository
public interface ModelCapabilityResultRepository extends JpaRepository<ModelCapabilityResult, Long> {

    /** Une note telle que la table la lit : sans son détail. */
    interface Row {
        Long getRunId();

        String getCaseKey();

        Boolean getPassed();

        Boolean getTooSlow();

        LocalDateTime getCreatedAt();
    }

    /** Une note telle que le banc la lit (R131) : sans sa réponse, avec son temps et ce qu'une personne en a dit. */
    interface BenchmarkRow {
        Long getId();

        Long getRunId();

        String getCaseKey();

        Boolean getPassed();

        Long getDurationMs();

        Boolean getPersonPassed();

        Long getPersonId();

        Boolean getTooSlow();

        LocalDateTime getCreatedAt();
    }

    Optional<ModelCapabilityResult> findByRunIdAndCaseKey(Long runId, String caseKey);

    List<Row> findRowsByRunIdIn(Collection<Long> runIds);

    List<BenchmarkRow> findBenchmarkRowsByRunIdIn(Collection<Long> runIds);

    long countByRunId(Long runId);

    long countByRunIdAndPassedTrue(Long runId);
}
