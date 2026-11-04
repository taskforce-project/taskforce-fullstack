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

        LocalDateTime getCreatedAt();
    }

    Optional<ModelCapabilityResult> findByRunIdAndCaseKey(Long runId, String caseKey);

    List<Row> findRowsByRunIdIn(Collection<Long> runIds);

    long countByRunId(Long runId);

    long countByRunIdAndPassedTrue(Long runId);
}
