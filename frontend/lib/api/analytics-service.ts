import { apiClient, AI_TIMEOUT_MS } from "./client";
import { ANALYTICS_ROUTES } from "../config/api-routes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyticsKpis {
  tasksResolved: number;
  tasksResolvedDelta: number;
  avgResolutionDays: number;
  avgResolutionDaysDelta: number;
  velocity: number;
  velocityDelta: number;
  activeCycles: number;
}

export interface ThroughputPoint {
  week: string;
  opened: number;
  resolved: number;
}

export interface BurndownPoint {
  day: string;
  remaining: number;
  ideal: number;
}

export interface MemberCapacity {
  userId: number;
  displayName: string;
  avatarUrl: string | null;
  openIssues: number;
}

/** Charge d'un jour pour un membre (US-022). */
export interface WorkloadPoint {
  date: string;
  count: number;
}

/** Charge d'un membre sur la fenêtre : total ouvert + série jour par jour. */
export interface MemberWorkload {
  userId: number;
  displayName: string;
  avatarUrl: string | null;
  openIssues: number;
  capacityHoursPerWeek: number | null;
  days: WorkloadPoint[];
}

/** Heatmap charge d'équipe : membres × jours sur [from, to). */
export interface Workload {
  from: string;
  to: string;
  members: MemberWorkload[];
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/** Suffixe `?projectId=` optionnel (filtre PROD-1.7). */
function projectQuery(projectId?: number | null): string {
  return projectId != null ? `?projectId=${projectId}` : "";
}

export async function getAnalyticsKpis(slug: string, projectId?: number | null): Promise<AnalyticsKpis> {
  const res = await apiClient.get<{ data: AnalyticsKpis }>(ANALYTICS_ROUTES.KPIS(slug) + projectQuery(projectId));
  return res.data.data;
}

/** Granularité du throughput : "week" (8 semaines, défaut) ou "day" (30 jours, tendance 1 mois). */
export type ThroughputBucket = "week" | "day";

export async function getAnalyticsThroughput(
  slug: string,
  projectId?: number | null,
  bucket?: ThroughputBucket,
): Promise<ThroughputPoint[]> {
  let query = projectQuery(projectId);
  if (bucket) query += `${query ? "&" : "?"}bucket=${bucket.toUpperCase()}`;
  const res = await apiClient.get<{ data: ThroughputPoint[] }>(ANALYTICS_ROUTES.THROUGHPUT(slug) + query);
  return res.data.data;
}

export async function getAnalyticsBurndown(slug: string, projectId?: number | null): Promise<BurndownPoint[]> {
  const res = await apiClient.get<{ data: BurndownPoint[] }>(ANALYTICS_ROUTES.BURNDOWN(slug) + projectQuery(projectId));
  return res.data.data;
}

export async function getAnalyticsCapacity(slug: string, projectId?: number | null): Promise<MemberCapacity[]> {
  const res = await apiClient.get<{ data: MemberCapacity[] }>(ANALYTICS_ROUTES.CAPACITY(slug) + projectQuery(projectId));
  return res.data.data;
}

export async function getAnalyticsWorkload(slug: string, days = 14): Promise<Workload> {
  const res = await apiClient.get<{ data: Workload }>(`${ANALYTICS_ROUTES.WORKLOAD(slug)}?days=${days}`);
  return res.data.data;
}

export interface AiInsight {
  agent: string;
  agentColor: string;
  category: string;
  urgency: "low" | "medium" | "high";
  confidence: number;
  action: string;
  insight: string;
}

export async function getAiInsights(slug: string): Promise<AiInsight[]> {
  const res = await apiClient.get<{ data: AiInsight[] }>(ANALYTICS_ROUTES.INSIGHTS(slug));
  return res.data.data;
}

// ---------------------------------------------------------------------------
// Génération de graphe par l'IA (langage naturel → spec rendue depuis les vraies séries)
// ---------------------------------------------------------------------------

/** Jeux de données réels qu'un graphe peut cibler (miroir du catalogue backend). */
export type ChartDataset = "throughput" | "burndown" | "capacity" | "workload";
export type ChartType = "area" | "bar" | "line";

/**
 * Spec de graphe produite par l'IA. Ne contient **aucune donnée** : décrit seulement comment
 * visualiser un jeu de données réel que le front charge via les endpoints ci-dessus.
 * `unsupported` renseigné = la demande ne peut pas être satisfaite (le front l'affiche tel quel).
 */
export interface ChartSpec {
  title: string;
  description: string;
  dataset: ChartDataset | null;
  chartType: ChartType | null;
  bucket: ThroughputBucket | null;
  series: string[];
  unsupported: string | null;
}

export async function generateChart(
  slug: string,
  prompt: string,
  projectId?: number | null,
): Promise<ChartSpec> {
  const res = await apiClient.post<{ data: ChartSpec }>(
    ANALYTICS_ROUTES.CHART(slug),
    { prompt, projectId: projectId ?? null },
    { timeout: AI_TIMEOUT_MS },
  );
  return res.data.data;
}

// ---------------------------------------------------------------------------
// Décision IA par projet (boucle OODA)
// ---------------------------------------------------------------------------

/**
 * Métriques observées d'un projet — la jambe « observe » de la boucle.
 *
 * La décision elle-même est produite par un **workflow asynchrone** : voir
 * `lib/api/analysis-service.ts` (`StoredBrief`, `StoredPriority`).
 */
export interface DecisionSnapshot {
  total: number;
  open: number;
  inProgress: number;
  completed: number;
  overdue: number;
  dueSoon: number;
}
