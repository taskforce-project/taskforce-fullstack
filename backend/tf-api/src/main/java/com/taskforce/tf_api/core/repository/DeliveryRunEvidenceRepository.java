package com.taskforce.tf_api.core.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.DeliveryRunEvidence;

@Repository
public interface DeliveryRunEvidenceRepository extends JpaRepository<DeliveryRunEvidence, Long> {

    /** Le dernier événement d'un run : son empreinte est le {@code prev} du suivant. */
    Optional<DeliveryRunEvidence> findTopByRunIdOrderBySeqDesc(Long runId);

    /** Le dossier entier, dans l'ordre de la chaîne. */
    List<DeliveryRunEvidence> findByRunIdOrderBySeqAsc(Long runId);

    /** Le dossier a-t-il déjà un événement de ce type (le plafond atteint) ? */
    boolean existsByRunIdAndType(Long runId, String type);

    /** Le premier événement de ce type du dossier : son {@code mission.started}. */
    Optional<DeliveryRunEvidence> findFirstByRunIdAndTypeOrderBySeqAsc(Long runId, String type);

    /**
     * Les dossiers d'avant la 1.18 dont la chaîne nomme ce courriel (R159, second tour, N4) : comme acteur, ou comme une
     * valeur de ses données ({@code pattern} : le courriel entre guillemets, échappé pour LIKE). Avant la 1.18, la chaîne
     * nommait les personnes par leur courriel ; son {@code mission.started} n'a pas de {@code accountable}.
     */
    @Query(value = "SELECT DISTINCT e.run_id FROM delivery_run_evidence e "
        + "WHERE (e.actor_id = :email OR e.data LIKE :pattern ESCAPE '\\') "
        + "AND NOT EXISTS (SELECT 1 FROM delivery_run_evidence s WHERE s.run_id = e.run_id AND s.type = 'mission.started' "
        + "AND (CAST(s.data AS jsonb) -> 'accountable') IS NOT NULL) ORDER BY e.run_id", nativeQuery = true)
    List<Long> findLegacyRunsNaming(@Param("email") String email, @Param("pattern") String pattern);

    /** Les rangs des événements de ce dossier qui nomment ce courriel. */
    @Query(value = "SELECT e.seq FROM delivery_run_evidence e WHERE e.run_id = :runId "
        + "AND (e.actor_id = :email OR e.data LIKE :pattern ESCAPE '\\') ORDER BY e.seq", nativeQuery = true)
    List<Integer> findSeqsNaming(@Param("runId") Long runId, @Param("email") String email, @Param("pattern") String pattern);

    /**
     * Le dossier a-t-il déjà un événement de ce type écrit par cet acteur ? Le constat du plafond est celui du serveur : le
     * runner écrit le sien sous le même type, quand il cesse d'envoyer (R159, second tour, N2).
     */
    boolean existsByRunIdAndTypeAndActorKind(Long runId, String type, String actorKind);

    /**
     * Les missions finies et scellées entre ces deux instants dont le dossier n'a pas encore de témoin (R159, L7) : le
     * témoin s'écrit après la fin, hors de sa transaction, et un redémarrage du serveur peut le perdre.
     */
    @Query(value = "SELECT r.id FROM delivery_runs r "
        + "WHERE r.evidence_root IS NOT NULL AND r.ended_at BETWEEN :since AND :before "
        + "AND EXISTS (SELECT 1 FROM mission_dossier_seals s WHERE s.run_id = r.id AND NOT s.late) "
        + "AND NOT EXISTS (SELECT 1 FROM mission_dossiers d WHERE d.run_id = r.id AND d.witnessed_at IS NOT NULL) "
        + "AND NOT EXISTS (SELECT 1 FROM delivery_run_evidence e WHERE e.run_id = r.id AND e.type = 'note' "
        + "AND CAST(e.data AS jsonb) ->> 'kind' = 'witness') ORDER BY r.ended_at LIMIT 50", nativeQuery = true)
    List<Long> findUnwitnessed(@Param("since") LocalDateTime since,
                               @Param("before") LocalDateTime before);
}
