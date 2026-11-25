package com.taskforce.tf_api.core.service.delivery;

import java.util.List;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.repository.MissionDossierRepository;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Le passage qui scelle, une fois, les dossiers finis avant que TaskForce ne scelle (R159, second tour, N5) : sans lui,
 * `npm run verify --key`, que la documentation demande, échouait sur un dossier authentique d'avant ce lot. Au démarrage,
 * chaque dossier sans sceau dont la mission n'est plus en cours reçoit un sceau tardif, qui le dit
 * ({@link MissionEvidenceService#sealLate}). Un dossier scellé ne l'est pas de nouveau : le passage suivant n'y trouve rien.
 * Le témoin ne s'écrit pas pour un sceau tardif : il reposterait dans des pull requests closes depuis longtemps.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MissionLateSeals {

    private final MissionDossierRepository dossiers;
    private final MissionEvidenceService evidence;

    @EventListener(ApplicationReadyEvent.class)
    public void sealAtStart() {
        seal();
    }

    /** Scelle tard chaque dossier qui en attend un ; rend combien il en a scellé. Un échec n'arrête pas les suivants. */
    public int seal() {
        List<Long> runs = dossiers.findUnsealedEnded();
        int sealed = 0;
        for (Long runId : runs) {
            try {
                if (evidence.sealLate(runId)) sealed++;
            } catch (RuntimeException e) {
                log.warn("Dossier {} : sceau tardif non posé : {}", runId, LogSafe.of(e.getMessage()));
            }
        }
        if (sealed > 0) log.info("{} dossier(s) d'avant le sceau scellé(s) tard", sealed);
        return sealed;
    }
}
