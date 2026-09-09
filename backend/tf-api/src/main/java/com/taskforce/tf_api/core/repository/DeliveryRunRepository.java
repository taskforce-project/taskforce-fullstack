package com.taskforce.tf_api.core.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.DeliveryRun;

/**
 * Runs de délégation à un agent (TF-AGENT-DELIVERY). Un run par délégation ; le plus récent d'une
 * issue est celui affiché.
 */
public interface DeliveryRunRepository extends JpaRepository<DeliveryRun, Long> {

    /** Dernier run d'une issue (pour afficher l'état de délégation courant). */
    Optional<DeliveryRun> findTopByIssueIdOrderByCreatedAtDesc(Long issueId);
}
