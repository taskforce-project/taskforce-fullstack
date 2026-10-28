package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.DeliveryRunEvidence;

@Repository
public interface DeliveryRunEvidenceRepository extends JpaRepository<DeliveryRunEvidence, Long> {

    /** Le dernier événement d'un run : son empreinte est le {@code prev} du suivant. */
    Optional<DeliveryRunEvidence> findTopByRunIdOrderBySeqDesc(Long runId);

    /** Le dossier entier, dans l'ordre de la chaîne. */
    List<DeliveryRunEvidence> findByRunIdOrderBySeqAsc(Long runId);
}
