/**
 * Limites par plan - DOIT rester aligné avec `WorkspaceService` côté backend
 * (constantes MAX_WORKSPACES / MAX_MEMBERS). Sert aux CTA d'usage / upgrade (PROD-4.2/4.3).
 */

export type PlanTier = "FREE" | "BASIC" | "BUSINESS" | "ENTERPRISE";

// Membres illimités sur tous les plans (tarification par membre/mois) ; seuls les workspaces sont plafonnés.
export const PLAN_LIMITS: Record<PlanTier, { workspaces: number; members: number }> = {
  FREE: { workspaces: 2, members: Number.POSITIVE_INFINITY },
  BASIC: { workspaces: 5, members: Number.POSITIVE_INFINITY },
  BUSINESS: { workspaces: Number.POSITIVE_INFINITY, members: Number.POSITIVE_INFINITY },
  ENTERPRISE: { workspaces: Number.POSITIVE_INFINITY, members: Number.POSITIVE_INFINITY },
};

function toTier(plan: string | null | undefined): PlanTier {
  if (plan === "BASIC" || plan === "BUSINESS" || plan === "ENTERPRISE") return plan;
  return "FREE";
}

export function planLimit(plan: string | null | undefined, key: "workspaces" | "members"): number {
  return PLAN_LIMITS[toTier(plan)][key];
}

/** Libellé court du plan pour l'UI. */
export function planLabel(plan: string | null | undefined): string {
  return toTier(plan).charAt(0) + toTier(plan).slice(1).toLowerCase();
}
