import { apiClient } from "./client";
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

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function getAnalyticsKpis(slug: string): Promise<AnalyticsKpis> {
  const res = await apiClient.get<{ data: AnalyticsKpis }>(ANALYTICS_ROUTES.KPIS(slug));
  return res.data.data;
}

export async function getAnalyticsThroughput(slug: string): Promise<ThroughputPoint[]> {
  const res = await apiClient.get<{ data: ThroughputPoint[] }>(ANALYTICS_ROUTES.THROUGHPUT(slug));
  return res.data.data;
}

export async function getAnalyticsBurndown(slug: string): Promise<BurndownPoint[]> {
  const res = await apiClient.get<{ data: BurndownPoint[] }>(ANALYTICS_ROUTES.BURNDOWN(slug));
  return res.data.data;
}

export async function getAnalyticsCapacity(slug: string): Promise<MemberCapacity[]> {
  const res = await apiClient.get<{ data: MemberCapacity[] }>(ANALYTICS_ROUTES.CAPACITY(slug));
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
