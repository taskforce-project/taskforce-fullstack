package com.taskforce.tf_api.core.service.delivery;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Au plafond de son dossier, la mission s'arrête (R159, second tour, N2) : rien ne continue sans être écrit. Le constat
 * {@code limit.reached} est déjà au dossier ; une fois validé, la mission se clôt par le chemin d'arrêt de toujours
 * ({@link DeliveryRunner#complete}), comme « Stop » : sa fin et son sceau s'écrivent dans la réserve, ses demandes ouvertes
 * se ferment, et le prochain signe de vie du runner est refusé, ce qui arrête l'agent.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MissionEvidenceCap {

    /**
     * L'erreur d'une mission arrêtée au plafond, telle que le dossier et la carte la gardent : sans nom de personne. L'app la
     * dit dans ses propres mots ({@code missionSequence.status.evidenceCap}).
     */
    public static final String STOPPED = "Evidence cap reached: TaskForce stopped the mission.";

    private final DeliveryRunner deliveryRunner;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onCapped(EvidenceCapped capped) {
        log.warn("Run {} : dossier de preuve plein, la mission s'arrête", capped.runId());
        deliveryRunner.complete(capped.runId(), new DeliveryPoll(DeliveryRunStatus.FAILED, null, null, STOPPED));
    }
}
