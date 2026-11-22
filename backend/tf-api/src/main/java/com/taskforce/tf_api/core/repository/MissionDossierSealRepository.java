package com.taskforce.tf_api.core.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.MissionDossierSeal;

/** Les sceaux d'un dossier, jamais réécrits : le dernier couvre tout le dossier. */
@Repository
public interface MissionDossierSealRepository extends JpaRepository<MissionDossierSeal, Long> {

    /** Le dernier sceau du dossier : celui qui couvre la chaîne la plus longue. */
    Optional<MissionDossierSeal> findTopByRunIdOrderBySeqDesc(Long runId);

    boolean existsByRunIdAndSeq(Long runId, Integer seq);
}
