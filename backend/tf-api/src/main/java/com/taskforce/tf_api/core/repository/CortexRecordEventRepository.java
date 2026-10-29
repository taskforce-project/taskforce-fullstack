package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.CortexRecordEvent;

@Repository
public interface CortexRecordEventRepository extends JpaRepository<CortexRecordEvent, Long> {

    /** Le dernier événement d'un dossier : son empreinte est le {@code prev} du suivant. */
    Optional<CortexRecordEvent> findTopByRecordIdOrderBySeqDesc(UUID recordId);

    /** Le dossier entier, dans l'ordre de la chaîne. */
    List<CortexRecordEvent> findByRecordIdOrderBySeqAsc(UUID recordId);
}
