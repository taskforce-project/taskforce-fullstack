package com.taskforce.tf_api.core.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.AiUsageResponse;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.AiTokenUsage;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.AiTokenUsageRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;

import lombok.RequiredArgsConstructor;

/**
 * Suivi de la **consommation IA réelle** par **compte** (le propriétaire des workspaces) et par mois
 * (agrégat incrémental) + exposition de la conso vs le **plafond du plan** (popover chat + page Settings
 * « Usage IA », façon Claude). Compté par compte et non par workspace pour que le quota ne soit pas
 * contournable en multipliant les workspaces.
 */
@Service
@RequiredArgsConstructor
public class AiUsageService {

    private final AiTokenUsageRepository repository;
    private final WorkspaceRepository workspaceRepository;
    private final UserRepository userRepository;
    private final BrainAccessGuard access;

    private static String currentPeriod() {
        return YearMonth.now().toString(); // 'YYYY-MM'
    }

    /**
     * Incrémente l'agrégat du mois courant sur le **compte** (propriétaire du workspace). No-op si usage
     * nul (repli/sans LLM) ou si le propriétaire est introuvable. Prend le {@code workspaceId} car c'est
     * ce que connaît l'agent ; la résolution workspace → compte vit ici (source unique de la logique de conso).
     */
    @Transactional
    public void record(Long workspaceId, LlmUsage usage) {
        if (workspaceId == null || usage == null || usage.totalTokens() <= 0) {
            return;
        }
        Long accountId = workspaceRepository.findOwnerIdByWorkspaceId(workspaceId).orElse(null);
        if (accountId == null) {
            return; // workspace/propriétaire introuvable → on ne compte rien (best-effort)
        }
        String period = currentPeriod();
        AiTokenUsage row = repository.findByAccountIdAndPeriod(accountId, period)
            .orElseGet(() -> {
                AiTokenUsage created = new AiTokenUsage();
                created.setAccountId(accountId);
                created.setPeriod(period);
                return created;
            });
        row.setPromptTokens(row.getPromptTokens() + usage.promptTokens());
        row.setCompletionTokens(row.getCompletionTokens() + usage.completionTokens());
        row.setTotalTokens(row.getTotalTokens() + usage.totalTokens());
        row.setRequestCount(row.getRequestCount() + 1);
        repository.save(row);
    }

    /**
     * Conso du mois courant du **compte** (propriétaire du workspace, agrégée sur tous ses workspaces)
     * + plafond de son plan. Un membre non-propriétaire voit donc la conso/quota du compte qui l'héberge.
     */
    @Transactional(readOnly = true)
    public AiUsageResponse getUsage(String slug, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        User owner = ws.getOwner();
        PlanType plan = (owner != null && owner.getPlanType() != null)
            ? owner.getPlanType() : PlanType.FREE;
        String period = currentPeriod();
        Optional<AiTokenUsage> row = (owner != null)
            ? repository.findByAccountIdAndPeriod(owner.getId(), period)
            : Optional.empty();
        String resetAt = LocalDate.now().plusMonths(1).withDayOfMonth(1).toString();

        long limit = limitFor(plan);
        long realTotal = row.map(AiTokenUsage::getTotalTokens).orElse(0L);
        long realPrompt = row.map(AiTokenUsage::getPromptTokens).orElse(0L);
        long realCompletion = row.map(AiTokenUsage::getCompletionTokens).orElse(0L);

        // Affichage PLAFONNÉ à 100 % (façon Claude) : le gate laisse terminer la requête qui franchit le
        // seuil, donc le réel peut dépasser le plafond — mais on ne l'AFFICHE jamais. Le RÉEL reste en base
        // (ai_token_usage) pour le calcul de coût / dépassement ; ici on borne uniquement ce qui est exposé.
        long shownTotal = limit >= 0 ? Math.min(realTotal, limit) : realTotal;
        long shownPrompt = realPrompt;
        long shownCompletion = realCompletion;
        if (limit >= 0 && realTotal > limit && realTotal > 0) {
            // Prorata pour que prompt↑ + completion↓ ne dépasse pas le total affiché plafonné.
            shownPrompt = Math.round(realPrompt * (double) limit / realTotal);
            shownCompletion = shownTotal - shownPrompt;
        }

        return new AiUsageResponse(
            plan.name(),
            shownTotal,
            limit,
            shownPrompt,
            shownCompletion,
            row.map(AiTokenUsage::getRequestCount).orElse(0),
            period,
            resetAt
        );
    }

    /**
     * Bloque (→ 409) si le <b>compte</b> a atteint son plafond mensuel de tokens IA. No-op si le plan est
     * illimité (Enterprise) ou si le compte/plafond est introuvable. Appelé <b>avant</b> chaque génération
     * LLM (cf. {@code AgentService.run}) : c'est le gate de l'IA (façon Claude, l'IA est métrée par tokens).
     *
     * <p><b>{@code noRollbackFor = IllegalStateException}</b> : ce gate est appelé DANS la transaction de
     * l'appelant (ex. {@code SmartAssignService.recommend}, {@code @Transactional}). Sans cette règle, la
     * levée au plafond marque la transaction partagée <b>rollback-only</b> : même si l'appelant <i>attrape</i>
     * l'exception pour retomber sur son repli déterministe (Java), le commit final échoue en
     * {@code UnexpectedRollbackException} (→ <b>500</b>). C'était le bug du smart-assign au plafond — le repli
     * Java s'exécutait bien mais la requête finissait en 500. Le gate est un pur signal de contrôle (aucune
     * écriture) : il ne doit jamais forcer de rollback. Le chat ({@code AgentService.run}, hors tx) reçoit
     * toujours son 409 — {@code noRollbackFor} n'affecte pas la propagation, seulement le marquage rollback.</p>
     */
    @Transactional(readOnly = true, noRollbackFor = IllegalStateException.class)
    public void assertWithinQuota(Long workspaceId) {
        if (workspaceId == null) {
            return;
        }
        Long accountId = workspaceRepository.findOwnerIdByWorkspaceId(workspaceId).orElse(null);
        if (accountId == null) {
            return;
        }
        PlanType plan = userRepository.findById(accountId).map(User::getPlanType).orElse(PlanType.FREE);
        long limit = limitFor(plan);
        if (limit < 0) {
            return; // illimité
        }
        long used = repository.findByAccountIdAndPeriod(accountId, currentPeriod())
            .map(AiTokenUsage::getTotalTokens).orElse(0L);
        if (used >= limit) {
            throw new IllegalStateException(
                "Quota IA mensuel atteint (" + limit + " tokens) sur votre forfait. "
                + "Passez à un forfait supérieur pour continuer à utiliser Cortex.");
        }
    }

    /**
     * Plafond mensuel de tokens IA par plan ({@code -1} = illimité). Métrage <b>par tokens</b> (façon
     * Claude) : une action lourde (analyse « deep » = gros modèle + raisonnement + boucle d'outils) coûte
     * déjà plus de quota qu'un smart-assign « fast » car elle <b>génère plus de tokens</b> — le routing
     * modèle par fonctionnalité (tier {@code fast}/{@code standard}/{@code deep} côté gateway) n'appelle
     * donc <b>aucune pondération</b> ici. Échelle 1× / 5× / 20× / ∞ ; mesuré ≈ 1,2k tokens/action →
     * FREE ≈ 80 actions/mois, BASIC ≈ 400, BUSINESS ≈ 1 600. Valeurs <b>arrêtées le 27/08/2026</b>
     * (décision pricing, cf. QA-46).
     */
    private long limitFor(PlanType plan) {
        return switch (plan) {
            case FREE -> 100_000L;        // 100k tokens/mois (~80 actions IA)
            case BASIC -> 500_000L;       // 500k tokens/mois (~400 actions IA)
            case BUSINESS -> 2_000_000L;  // 2M tokens/mois (~1 600 actions IA)
            case ENTERPRISE -> -1L;       // illimité
        };
    }
}
