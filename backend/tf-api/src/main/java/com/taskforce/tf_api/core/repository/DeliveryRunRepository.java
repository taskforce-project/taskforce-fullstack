package com.taskforce.tf_api.core.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.taskforce.tf_api.core.model.DeliveryRun;

/**
 * Runs de délégation à un agent (TF-AGENT-DELIVERY). Un run par délégation ; le plus récent d'une
 * issue est celui affiché.
 */
public interface DeliveryRunRepository extends JpaRepository<DeliveryRun, Long> {

    /** Dernier run d'une issue (pour afficher l'état de délégation courant). */
    Optional<DeliveryRun> findTopByIssueIdOrderByCreatedAtDesc(Long issueId);

    /**
     * Runs de délégation des projets donnés (issue → projet), les plus récents d'abord. Sert la vue
     * « workflow » au niveau workspace : on borne aux projets que l'utilisateur peut voir (calculés en
     * amont) pour ne jamais fuiter les runs d'un projet privé.
     */
    @Query("SELECT r FROM DeliveryRun r WHERE r.issue.project.id IN :projectIds ORDER BY r.updatedAt DESC")
    List<DeliveryRun> findByProjectIds(@Param("projectIds") Collection<Long> projectIds, Pageable pageable);
}
