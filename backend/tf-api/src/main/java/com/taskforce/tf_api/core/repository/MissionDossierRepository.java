package com.taskforce.tf_api.core.repository;

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
}
