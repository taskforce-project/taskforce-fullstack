package com.taskforce.tf_api.core.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.DeliveryRunEvent;

@Repository
public interface DeliveryRunEventRepository extends JpaRepository<DeliveryRunEvent, Long> {

    /** Dernier numéro d'ordre d'un run, 0 s'il n'a pas d'événement. */
    @Query("SELECT COALESCE(MAX(e.seq), 0) FROM DeliveryRunEvent e WHERE e.run.id = :runId")
    int maxSeq(@Param("runId") Long runId);

    /** Événements après {@code after}, dans l'ordre : le front lit la suite de ce qu'il a déjà. */
    List<DeliveryRunEvent> findByRunIdAndSeqGreaterThanOrderBySeqAsc(Long runId, Integer after, Pageable page);

    /** Le dernier événement de chacune de ces missions : leur étape en cours, pour la vue du projet (R166). */
    @Query("""
        SELECT e FROM DeliveryRunEvent e
        WHERE e.run.id IN :runIds
          AND e.seq = (SELECT MAX(e2.seq) FROM DeliveryRunEvent e2 WHERE e2.run.id = e.run.id)
        """)
    List<DeliveryRunEvent> findLastByRunIds(@Param("runIds") Collection<Long> runIds);
}
