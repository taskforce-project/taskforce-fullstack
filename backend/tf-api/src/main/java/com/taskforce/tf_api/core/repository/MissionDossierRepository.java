package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.MissionDossier;

import jakarta.persistence.LockModeType;

/** Les dossiers des missions, un par mission qui en a ouvert un (V135) : ils survivent à la mission et à son issue. */
@Repository
public interface MissionDossierRepository extends JpaRepository<MissionDossier, Long> {

    /**
     * Le dossier, verrouillé : deux ajouts à sa chaîne ne se croisent jamais, même quand la mission n'existe plus (un texte
     * effacé après la suppression de l'issue).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM MissionDossier d WHERE d.runId = :runId")
    Optional<MissionDossier> findByIdForUpdate(@Param("runId") Long runId);

    /**
     * Les dossiers qui ont des événements, aucun sceau, et dont la mission n'est plus en cours (R159, second tour, N5) : ceux
     * des missions finies avant que TaskForce ne scelle. Une mission en cours se scelle à sa fin.
     */
    @Query(value = "SELECT d.run_id FROM mission_dossiers d "
        + "WHERE NOT EXISTS (SELECT 1 FROM mission_dossier_seals s WHERE s.run_id = d.run_id) "
        + "AND EXISTS (SELECT 1 FROM delivery_run_evidence e WHERE e.run_id = d.run_id) "
        + "AND NOT EXISTS (SELECT 1 FROM delivery_runs r WHERE r.id = d.run_id AND r.status IN ('QUEUED', 'RUNNING')) "
        + "ORDER BY d.run_id", nativeQuery = true)
    List<Long> findUnsealedEnded();
}
