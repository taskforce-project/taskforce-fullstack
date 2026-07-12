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
        return new AiUsageResponse(
            plan.name(),
            row.map(AiTokenUsage::getTotalTokens).orElse(0L),
            limitFor(plan),
            row.map(AiTokenUsage::getPromptTokens).orElse(0L),
            row.map(AiTokenUsage::getCompletionTokens).orElse(0L),
            row.map(AiTokenUsage::getRequestCount).orElse(0),
            period,
            resetAt
        );
    }

    /**
     * Bloque (→ 409) si le <b>compte</b> a atteint son plafond mensuel de tokens IA. No-op si le plan est
     * illimité (Enterprise) ou si le compte/plafond est introuvable. Appelé <b>avant</b> chaque génération
     * LLM (cf. {@code AgentService.run}) : c'est le gate de l'IA (façon Claude, l'IA est métrée par tokens).
     */
    @Transactional(readOnly = true)
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
     * Plafond mensuel de tokens IA par plan ({@code -1} = illimité).
     * Valeurs <b>placeholder</b> volontairement généreuses (modèle local ≈ coût serveur) — le calibrage
     * final dépend de la décision pricing (cf. TF-PLAN-STORAGE / TF-AI-BUDGET).
     */
    private long limitFor(PlanType plan) {
        return switch (plan) {
            case FREE -> 100_000L;        // 100k tokens/mois
            case BASIC -> 500_000L;       // 500k tokens/mois
            case BUSINESS -> 2_000_000L;  // 2M tokens/mois
            case ENTERPRISE -> -1L;       // illimité
        };
    }
}
