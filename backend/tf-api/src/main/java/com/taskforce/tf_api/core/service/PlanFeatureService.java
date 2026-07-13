package com.taskforce.tf_api.core.service;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.taskforce.tf_api.core.enums.PlanFeature;
import com.taskforce.tf_api.core.enums.PlanType;

/**
 * Gating des fonctionnalités par plan (PROD-4.4). Source unique de la **politique** —
 * à ajuster ici (et à mirrorer côté front dans `plan-features.ts`).
 *
 * <p>Politique produit (validée 13/07) : <b>l'IA est incluse partout</b>, métrée par TOKENS
 * (smart-assign + assistant Cortex + insights, dispo dès FREE — cf. {@code AiUsageService.assertWithinQuota}
 * + {@code AiMeter}). Les <b>murs payants</b> (BUSINESS+) sont les capacités de <b>scale</b> :
 * analytics avancées, intégrations, historique illimité ({@code UNLIMITED_HISTORY}, cf.
 * {@code IssueService.listActivity}).</p>
 */
@Service
public class PlanFeatureService {

    private static final Map<PlanType, Set<PlanFeature>> MATRIX = Map.of(
        // IA incluse PARTOUT, métrée par tokens (smart-assign + assistant Cortex + insights) — « IA native incluse ».
        // Murs payants (BUSINESS+) = capacités de scale : analytics avancées / intégrations / historique illimité.
        PlanType.FREE,       EnumSet.of(PlanFeature.AI_SMART_ASSIGN, PlanFeature.AI_ASSISTANT, PlanFeature.AI_INSIGHTS),
        PlanType.BASIC,      EnumSet.of(PlanFeature.AI_SMART_ASSIGN, PlanFeature.AI_ASSISTANT, PlanFeature.AI_INSIGHTS),
        PlanType.BUSINESS,   EnumSet.allOf(PlanFeature.class),
        PlanType.ENTERPRISE, EnumSet.allOf(PlanFeature.class)
    );

    public boolean has(PlanType plan, PlanFeature feature) {
        PlanType effective = plan == null ? PlanType.FREE : plan;
        return MATRIX.getOrDefault(effective, EnumSet.noneOf(PlanFeature.class)).contains(feature);
    }

    /** Lève une erreur métier (→ 409) si le plan ne couvre pas la fonctionnalité. */
    public void requireFeature(PlanType plan, PlanFeature feature) {
        if (!has(plan, feature)) {
            throw new IllegalStateException(
                "Cette fonctionnalité nécessite un plan supérieur (" + feature + ").");
        }
    }
}
