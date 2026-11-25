package com.taskforce.tf_api.core.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.MissionDossierSeal;

/** Les sceaux d'un dossier, jamais réécrits : le dernier couvre tout le dossier. */
@Repository
public interface MissionDossierSealRepository extends JpaRepository<MissionDossierSeal, Long> {

    /** Le dernier sceau du dossier : celui qui couvre la chaîne la plus longue. */
    Optional<MissionDossierSeal> findTopByRunIdOrderBySeqDesc(Long runId);

    boolean existsByRunIdAndSeq(Long runId, Integer seq);

    /** Le dossier a-t-il déjà été scellé tard (R159, second tour, N5) ? Ses sceaux suivants le sont aussi. */
    boolean existsByRunIdAndLateTrue(Long runId);

    /**
     * Les têtes scellées de ce dossier, dans l'ordre (R159, troisième tour, c-d) : un commentaire qui en porte une est son
     * témoin, écrit à un essai d'avant, même quand un geste a scellé le dossier depuis.
     */
    @Query("SELECT s.root FROM MissionDossierSeal s WHERE s.runId = :runId ORDER BY s.seq")
    List<String> findRootsByRunId(@Param("runId") Long runId);

    /** Une clé qui a scellé des dossiers d'un espace : son identifiant, son premier et son dernier sceau, combien. */
    interface KeyUse {
        String getKeyId();

        String getFirstUsed();

        String getLastUsed();

        Long getSeals();
    }

    /**
     * Les clés qui ont scellé les dossiers de cet espace, la plus récente d'abord (R159, M3) : les sceaux suffisent, chacun
     * garde sa clé publique ; aucune table de plus.
     */
    @Query(value = "SELECT s.key_id AS keyId, MIN(s.sealed_at) AS firstUsed, MAX(s.sealed_at) AS lastUsed, COUNT(*) AS seals "
        + "FROM mission_dossier_seals s JOIN mission_dossiers d ON d.run_id = s.run_id WHERE d.workspace_id = :workspaceId "
        + "GROUP BY s.key_id ORDER BY MAX(s.sealed_at) DESC", nativeQuery = true)
    List<KeyUse> keysUsedIn(@Param("workspaceId") Long workspaceId);

    /** Le dernier sceau de cette clé dans cet espace : son énoncé porte la clé publique et sa garde. */
    @Query(value = "SELECT s.envelope FROM mission_dossier_seals s JOIN mission_dossiers d ON d.run_id = s.run_id "
        + "WHERE d.workspace_id = :workspaceId AND s.key_id = :keyId ORDER BY s.sealed_at DESC LIMIT 1", nativeQuery = true)
    Optional<String> lastEnvelopeOf(@Param("workspaceId") Long workspaceId, @Param("keyId") String keyId);
}
