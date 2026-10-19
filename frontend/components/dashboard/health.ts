/**
 * Santé d'une opération - logique reprise du dashboard historique (TF-DASH-HARDCODE) :
 * calculée depuis les vraies données projet (statut + ratio d'issues ouvertes).
 */
import type { Project } from "@/lib/api/project-service";

export type OperationHealth = "healthy" | "atRisk" | "critical" | "paused";

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
