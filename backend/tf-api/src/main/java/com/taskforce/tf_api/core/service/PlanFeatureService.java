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
 * <p>Défaut (à confirmer produit) : le cœur CDC (smart-assign) reste GRATUIT ;
 * insights/assistant/analytics avancées/intégrations/historique illimité sont PRO+.
 * Le mécanisme est en place mais l'enforcement aux endpoints reste à câbler une fois
 * la politique validée (éviter de masquer l'IA au plan FREE en dev).</p>
 */
@Service
public class PlanFeatureService {

    private static final Map<PlanType, Set<PlanFeature>> MATRIX = Map.of(
        // Cœur (smart-assign) gratuit ; analytics avancées / insights / assistant = BUSINESS+.
        PlanType.FREE, EnumSet.of(PlanFeature.AI_SMART_ASSIGN),
        PlanType.BASIC, EnumSet.of(PlanFeature.AI_SMART_ASSIGN),
        PlanType.BUSINESS, EnumSet.allOf(PlanFeature.class),
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
