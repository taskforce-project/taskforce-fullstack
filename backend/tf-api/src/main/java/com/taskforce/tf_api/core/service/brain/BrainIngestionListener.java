package com.taskforce.tf_api.core.service.brain;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.taskforce.tf_api.core.event.CycleCompletedEvent;
import com.taskforce.tf_api.core.event.IssueCompletedEvent;
import com.taskforce.tf_api.core.service.brain.BrainIngestionService.CycleFacts;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Branche l'activité projet sur le Brain OS. C'est le seul endroit où le graphe se nourrit
 * <b>tout seul</b> — tous les autres chemins d'écriture attendent un clic humain.
 *
 * <p>Trois garanties, par ordre d'importance :
 * <ol>
 *   <li><b>{@code AFTER_COMMIT}</b> — l'ingestion ne part qu'une fois la transaction métier validée.
 *       Un échec ici ne peut donc pas annuler la clôture d'un cycle, et la lecture voit bien les
 *       lignes que cette transaction vient d'écrire.</li>
 *   <li><b>{@code @Async}</b> — la requête HTTP ne paie pas l'appel LLM (jusqu'à ~200 s). Bean
 *       distinct du service : Spring n'applique ni {@code @Async} ni {@code @Transactional} sur un
 *       auto-appel, et c'est aussi ce qui donne à chaque étape sa propre transaction courte.</li>
 *   <li><b>try/catch</b> — l'ingestion est un effet de bord : elle n'a pas le droit de remonter
 *       quoi que ce soit à l'appelant, ni de faire échouer une action métier.</li>
 * </ol>
 *
 * <p>L'orchestration vit ici (et non dans le service) pour que l'appel LLM tombe <b>entre</b> deux
 * transactions courtes plutôt que dans une longue : sinon Hibernate garderait une connexion du pool
 * mobilisée pendant toute la génération.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class BrainIngestionListener {

    private final BrainIngestionService ingestion;

    /** Cycle clôturé → rétro complète : faits (transaction courte) → rédaction IA (hors transaction) → écriture. */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCycleCompleted(CycleCompletedEvent event) {
        try {
            // Les faits sont relus une première fois ici pour nourrir le LLM ; l'écriture les
            // recollectera sous verrou (c'est cette photo-là qui fait foi).
            CycleFacts facts = ingestion.collectCycleFacts(event.cycleId());
            if (facts == null) return;
            String synthesis = ingestion.synthesize(event.workspaceId(), facts);
            ingestion.writeCycleNode(
                event.workspaceSlug(), event.workspaceId(), event.userId(), event.cycleId(), synthesis, true);
        } catch (Exception ex) {
            log.warn("Ingestion Brain OS KO pour le cycle {} : {}", event.cycleId(), ex.getMessage(), ex);
        }
    }

    /** Issue terminée → rafraîchit le relevé du cycle porteur. Aucun LLM en cours de cycle : instantané et gratuit. */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onIssueCompleted(IssueCompletedEvent event) {
        try {
            Long cycleId = ingestion.findActiveCycleId(event.issueId());
            if (cycleId == null) return; // issue hors cycle actif → rien à alimenter
            ingestion.writeCycleNode(
                event.workspaceSlug(), event.workspaceId(), event.userId(), cycleId, null, false);
        } catch (Exception ex) {
            log.warn("Ingestion Brain OS KO pour l'issue {} : {}", event.issueId(), ex.getMessage(), ex);
        }
    }
}
