/**
 * Service pour les indisponibilités / congés d'un membre (US-006).
 * Routes : AVAILABILITY_ROUTES (scopées par workspace slug + userId).
 */

import { apiClient } from "./client";
import { AVAILABILITY_ROUTES } from "../config/api-routes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LeaveType = "VACATION" | "SICK" | "REMOTE" | "OTHER";

export interface MemberLeave {
  id: number;
  userId: number;
  type: LeaveType;
  /** ISO date 'YYYY-MM-DD' */
  startDate: string;
  /** ISO date 'YYYY-MM-DD' */
  endDate: string;
  note: string | null;
  createdAt: string;
}

export interface CreateLeavePayload {
  type: LeaveType;
  startDate: string;
  endDate: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/** Liste les indisponibilités d'un membre. */
export async function listLeaves(slug: string, userId: number): Promise<MemberLeave[]> {
  const response = await apiClient.get<{ data: MemberLeave[] }>(AVAILABILITY_ROUTES.LEAVES(slug, userId));
  return response.data.data;
}

/** Crée une indisponibilité pour un membre. */
export async function createLeave(slug: string, userId: number, payload: CreateLeavePayload): Promise<MemberLeave> {
  const response = await apiClient.post<{ data: MemberLeave }>(AVAILABILITY_ROUTES.LEAVES(slug, userId), payload);
  return response.data.data;
}

/** Supprime une indisponibilité d'un membre. */
export async function deleteLeave(slug: string, userId: number, leaveId: number): Promise<void> {
  await apiClient.delete(AVAILABILITY_ROUTES.LEAVE(slug, userId, leaveId));
}
