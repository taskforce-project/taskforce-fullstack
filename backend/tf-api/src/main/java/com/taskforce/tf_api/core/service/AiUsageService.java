package com.taskforce.tf_api.core.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.AiUsageResponse;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.AiTokenUsage;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.AiTokenUsageRepository;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;

import lombok.RequiredArgsConstructor;

/**
 * Suivi de la **consommation IA réelle** par workspace et par mois (agrégat incrémental) + exposition
 * de la conso vs le **plafond du plan** (popover chat + page Settings « Usage IA », façon Claude).
 */
@Service
@RequiredArgsConstructor
public class AiUsageService {

    private final AiTokenUsageRepository repository;
    private final BrainAccessGuard access;

    private static String currentPeriod() {
        return YearMonth.now().toString(); // 'YYYY-MM'
    }

    /** Incrémente l'agrégat du mois courant. No-op si usage nul (repli/sans LLM). */
    @Transactional
    public void record(Long workspaceId, LlmUsage usage) {
        if (workspaceId == null || usage == null || usage.totalTokens() <= 0) {
            return;
        }
        String period = currentPeriod();
        AiTokenUsage row = repository.findByWorkspaceIdAndPeriod(workspaceId, period)
            .orElseGet(() -> {
                AiTokenUsage created = new AiTokenUsage();
                created.setWorkspaceId(workspaceId);
                created.setPeriod(period);
                return created;
            });
        row.setPromptTokens(row.getPromptTokens() + usage.promptTokens());
        row.setCompletionTokens(row.getCompletionTokens() + usage.completionTokens());
        row.setTotalTokens(row.getTotalTokens() + usage.totalTokens());
        row.setRequestCount(row.getRequestCount() + 1);
        repository.save(row);
    }

    /** Conso du mois courant + plafond du plan (du propriétaire du workspace). */
    @Transactional(readOnly = true)
    public AiUsageResponse getUsage(String slug, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        PlanType plan = (ws.getOwner() != null && ws.getOwner().getPlanType() != null)
            ? ws.getOwner().getPlanType() : PlanType.FREE;
        String period = currentPeriod();
        Optional<AiTokenUsage> row = repository.findByWorkspaceIdAndPeriod(ws.getId(), period);
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
     * Plafond mensuel de tokens IA par plan ({@code -1} = illimité).
     * Valeurs <b>placeholder</b> volontairement généreuses (modèle local ≈ coût serveur) — le calibrage
     * final dépend de la décision pricing (cf. TF-PLAN-STORAGE / TF-AI-BUDGET).
     */
    private long limitFor(PlanType plan) {
        return switch (plan) {
            case FREE -> 100_000L;      // 100k tokens/mois (généreux pour du modèle local)
            case PRO -> 1_000_000L;     // 1M tokens/mois
            default -> -1L;             // ENTERPRISE (et plans supérieurs) : illimité
        };
    }
}
