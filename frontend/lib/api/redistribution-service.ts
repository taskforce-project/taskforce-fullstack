import { apiClient, AI_TIMEOUT_MS } from "@/lib/api/client";
import { WORKSPACE_ROUTES } from "@/lib/config/api-routes";

/**
 * Redistribution de charge (PROD-1.12, trou CDC #4 « ajustements dynamiques »).
 * Le backend propose un plan (preview) qu'un manager valide (apply) - jamais de réassignation silencieuse.
 */

export interface RedistributionMove {
  issueId: number;
  issueTitle: string;
  projectId: number;
  projectName: string;
  fromUserId: number;
  fromName: string;
  toUserId: number;
  toName: string;
  toScore: number;
  reason: string;
  priority: string;
  storyPoints: number | null;
}

export interface MemberLoad {
  userId: number;
  name: string;
  openBefore: number;
  openAfter: number;
  overloaded: boolean;
}

export interface RedistributionPlan {
  threshold: number;
  totalMoves: number;
  moves: RedistributionMove[];
  memberLoads: MemberLoad[];
}

export interface ApplyRedistributionResult {
  applied: number;
  skipped: number;
}

/** Calcule un plan de redistribution (aucune écriture). `targetUserId` limite à un membre surchargé. */
export async function previewRedistribution(
  slug: string,
  targetUserId?: number
): Promise<RedistributionPlan> {
  const url = targetUserId
    ? `${WORKSPACE_ROUTES.REDISTRIBUTE_PREVIEW(slug)}?userId=${targetUserId}`
    : WORKSPACE_ROUTES.REDISTRIBUTE_PREVIEW(slug);
  // Flux IA-heavy : le back range les candidats via le LLM (une passe par issue déplaçable) →
  // peut dépasser les 30s par défaut avec plusieurs membres surchargés. Timeout IA long.
  const res = await apiClient.post<{ data: RedistributionPlan }>(url, {}, { timeout: AI_TIMEOUT_MS });
  return res.data.data;
}

/** Applique les déplacements validés par le manager. */
export async function applyRedistribution(
  slug: string,
  moves: Array<{ issueId: number; toUserId: number }>
): Promise<ApplyRedistributionResult> {
  const res = await apiClient.post<{ data: ApplyRedistributionResult }>(
    WORKSPACE_ROUTES.REDISTRIBUTE_APPLY(slug),
    { moves }
  );
  return res.data.data;
}
