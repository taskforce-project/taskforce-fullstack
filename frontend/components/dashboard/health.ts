/**
 * Santé d'une opération - logique reprise du dashboard historique (TF-DASH-HARDCODE) :
 * calculée depuis les vraies données projet (statut + ratio d'issues ouvertes).
 */
import type { Project } from "@/lib/api/project-service";

export type OperationHealth = "healthy" | "atRisk" | "critical" | "paused";

/** Libellé + pastille par état de santé - source unique (rose aligné sur la SegmentBar). */
export const HEALTH_META: Record<OperationHealth, { label: string; dot: string }> = {
  healthy: { label: "Sur les rails", dot: "bg-emerald-500" },
  atRisk: { label: "À risque", dot: "bg-amber-500" },
  critical: { label: "Critique", dot: "bg-rose-500" },
  paused: { label: "En pause", dot: "bg-muted-foreground/50" },
};

export function healthOf(p: Pick<Project, "status" | "openIssues" | "totalIssues">): OperationHealth {
  if (p.status === "PAUSED" || p.status === "ARCHIVED") return "paused";
  if (p.totalIssues === 0) return "healthy";
  const ratio = p.openIssues / p.totalIssues;
  if (ratio > 0.85) return "critical";
  if (ratio > 0.55) return "atRisk";
  return "healthy";
}

/** Compteurs de santé agrégés sur une liste de projets. */
export function healthCounts(projects: readonly Project[]): Record<OperationHealth, number> {
  const counts: Record<OperationHealth, number> = { healthy: 0, atRisk: 0, critical: 0, paused: 0 };
  for (const p of projects) counts[healthOf(p)]++;
  return counts;
}
