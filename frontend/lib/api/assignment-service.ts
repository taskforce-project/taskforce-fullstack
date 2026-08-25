/**
 * Acceptation / refus d'une assignation de tâche par l'assigné courant.
 */

import { apiClient } from "./client";
import { ASSIGNMENT_ROUTES } from "../config/api-routes";
import type { Issue } from "./issue-service";

/** Accepte l'assignation → l'issue reste assignée (statut ACCEPTED). */
export async function acceptAssignment(issueId: number): Promise<Issue> {
  const response = await apiClient.post<{ data: Issue }>(ASSIGNMENT_ROUTES.ACCEPT(issueId));
  return response.data.data;
}

/** Refuse l'assignation → l'issue est désassignée + l'assigneur est prévenu. */
export async function declineAssignment(issueId: number): Promise<Issue> {
  const response = await apiClient.post<{ data: Issue }>(ASSIGNMENT_ROUTES.DECLINE(issueId));
  return response.data.data;
}
