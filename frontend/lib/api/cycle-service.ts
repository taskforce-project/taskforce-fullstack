/**
 * Service pour les opérations sur les cycles.
 * Toutes les routes sont scopées par workspace slug + project id.
 */

import { apiClient } from "./client";
import { CYCLE_ROUTES, ISSUE_ROUTES } from "../config/api-routes";
import type { Issue } from "./issue-service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CycleStatus = "DRAFT" | "ACTIVE" | "COMPLETED";

export interface UserSummaryCycle {
  id: number;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface Cycle {
  id: number;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: CycleStatus;
  createdBy: UserSummaryCycle;
  createdAt: string;
  updatedAt: string;
  issueCount: number;
  completedCount: number;
}

export interface CreateCyclePayload {
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
}

export interface UpdateCyclePayload {
  name?: string;
  description?: string;
  startDate?: string | null;
  endDate?: string | null;
  status?: CycleStatus;
}

// ---------------------------------------------------------------------------
// CRUD cycles
// ---------------------------------------------------------------------------

export async function listCycles(slug: string, projectId: number): Promise<Cycle[]> {
  const res = await apiClient.get<{ data: Cycle[] }>(CYCLE_ROUTES.LIST(slug, projectId));
  return res.data.data;
}

/** Cycle rendu dans une vue cross-projets : le projet porteur voyage avec le cycle. */
export interface WorkspaceCycle {
  projectId: number;
  projectName: string;
  cycle: Cycle;
}

/**
 * Tous les cycles des projets visibles du workspace, en UN appel.
 * Remplace la boucle « un appel par projet » de « Ma file », qui épuisait le rate limit.
 */
export async function listWorkspaceCycles(slug: string): Promise<WorkspaceCycle[]> {
  const res = await apiClient.get<{ data: WorkspaceCycle[] }>(ISSUE_ROUTES.MY_CYCLES(slug));
  return res.data.data;
}

export async function createCycle(
  slug: string,
  projectId: number,
  payload: CreateCyclePayload
): Promise<Cycle> {
  const res = await apiClient.post<{ data: Cycle }>(CYCLE_ROUTES.CREATE(slug, projectId), payload);
  return res.data.data;
}

export async function getCycle(slug: string, projectId: number, cycleId: number): Promise<Cycle> {
  const res = await apiClient.get<{ data: Cycle }>(CYCLE_ROUTES.BY_ID(slug, projectId, cycleId));
  return res.data.data;
}

export async function updateCycle(
  slug: string,
  projectId: number,
  cycleId: number,
  payload: UpdateCyclePayload
): Promise<Cycle> {
  const res = await apiClient.patch<{ data: Cycle }>(
    CYCLE_ROUTES.UPDATE(slug, projectId, cycleId),
    payload
  );
  return res.data.data;
}

export async function deleteCycle(
  slug: string,
  projectId: number,
  cycleId: number
): Promise<void> {
  await apiClient.delete(CYCLE_ROUTES.DELETE(slug, projectId, cycleId));
}

// ---------------------------------------------------------------------------
// Issues du cycle
// ---------------------------------------------------------------------------

export async function listCycleIssues(
  slug: string,
  projectId: number,
  cycleId: number
): Promise<Issue[]> {
  const res = await apiClient.get<{ data: Issue[] }>(CYCLE_ROUTES.ISSUES(slug, projectId, cycleId));
  return res.data.data;
}

export async function addIssueToCycle(
  slug: string,
  projectId: number,
  cycleId: number,
  issueId: number
): Promise<void> {
  await apiClient.post(CYCLE_ROUTES.ISSUES(slug, projectId, cycleId), { issueId });
}

export async function removeIssueFromCycle(
  slug: string,
  projectId: number,
  cycleId: number,
  issueId: number
): Promise<void> {
  await apiClient.delete(CYCLE_ROUTES.ISSUE(slug, projectId, cycleId, issueId));
}

/** Cycles auxquels une issue est rattachée (reverse-lookup pour le sélecteur du sheet — CYC-03b). */
export async function listIssueCycles(
  slug: string,
  projectId: number,
  issueId: number
): Promise<Cycle[]> {
  const res = await apiClient.get<{ data: Cycle[] }>(CYCLE_ROUTES.FOR_ISSUE(slug, projectId, issueId));
  return res.data.data;
}
