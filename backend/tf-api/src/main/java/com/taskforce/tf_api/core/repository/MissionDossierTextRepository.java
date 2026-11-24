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

    /** Le même texte, déjà gardé dans ce dossier et pas effacé : il garde son sel, et donc son empreinte. */
    Optional<MissionDossierText> findFirstByRunIdAndKindAndBody(Long runId, String kind, String body);

    /** Ce que le dossier sait déjà de cette personne, de cette sorte (son courriel, son nom). */
    boolean existsByRunIdAndPersonAndKind(Long runId, String person, String kind);

    /** Ce que les dossiers gardent encore d'une personne : son courriel, son nom, à effacer avec son compte. */
    List<MissionDossierText> findByPersonAndBodyIsNotNull(String person);
}
