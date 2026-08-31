/**
 * Gating des fonctionnalités par plan (PROD-4.4) - DOIT rester aligné avec
 * `PlanFeatureService` côté backend.
 */

import type { PlanTier } from "./plan-limits";

export type PlanFeature =
  | "AI_SMART_ASSIGN"
  | "AI_INSIGHTS"
  | "AI_ASSISTANT"
  | "ADVANCED_ANALYTICS"
  | "INTEGRATIONS"
  | "UNLIMITED_HISTORY";

const ALL: PlanFeature[] = [
  "AI_SMART_ASSIGN", "AI_INSIGHTS", "AI_ASSISTANT",
  "ADVANCED_ANALYTICS", "INTEGRATIONS", "UNLIMITED_HISTORY",
];

const MATRIX: Record<PlanTier, PlanFeature[]> = {
  // IA incluse partout (métrée par tokens) ; murs payants = analytics avancées / intégrations / historique illimité.
  FREE: ["AI_SMART_ASSIGN", "AI_ASSISTANT", "AI_INSIGHTS"],
  BASIC: ["AI_SMART_ASSIGN", "AI_ASSISTANT", "AI_INSIGHTS"],
  BUSINESS: ALL,
  ENTERPRISE: ALL,
};

function toTier(plan: string | null | undefined): PlanTier {
  if (plan === "BASIC" || plan === "BUSINESS" || plan === "ENTERPRISE") return plan;
  return "FREE";
}

export function planHasFeature(plan: string | null | undefined, feature: PlanFeature): boolean {
  return MATRIX[toTier(plan)].includes(feature);
}
