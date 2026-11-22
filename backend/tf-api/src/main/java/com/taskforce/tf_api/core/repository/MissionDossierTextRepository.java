package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.MissionDossierText;

/** Les textes d'un dossier, gardés à côté de sa chaîne : un par empreinte. */
@Repository
public interface MissionDossierTextRepository extends JpaRepository<MissionDossierText, Long> {

    List<MissionDossierText> findByRunIdOrderByIdAsc(Long runId);

    Optional<MissionDossierText> findByRunIdAndHash(Long runId, String hash);

    boolean existsByRunIdAndHash(Long runId, String hash);
}
