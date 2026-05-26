/**
 * Service pour les labels de projet.
 * Routes: /api/workspaces/{slug}/projects/{id}/labels[/{labelId}]
 */

import { apiClient } from "./client";
import { PROJECT_ROUTES } from "../config/api-routes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
  createdAt: string;
}

export interface CreateLabelPayload {
  name: string;
  color?: string;
  description?: string;
}

export interface UpdateLabelPayload {
  name?: string;
  color?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function listLabels(slug: string, projectId: number): Promise<ProjectLabel[]> {
  const res = await apiClient.get<{ data: ProjectLabel[] }>(PROJECT_ROUTES.LABELS(slug, projectId));
  return res.data.data;
}

export async function createLabel(
  slug: string,
  projectId: number,
  payload: CreateLabelPayload
): Promise<ProjectLabel> {
  const res = await apiClient.post<{ data: ProjectLabel }>(
    PROJECT_ROUTES.LABELS(slug, projectId),
    payload
  );
  return res.data.data;
}

export async function updateLabel(
  slug: string,
  projectId: number,
  labelId: number,
  payload: UpdateLabelPayload
): Promise<ProjectLabel> {
  const res = await apiClient.put<{ data: ProjectLabel }>(
    PROJECT_ROUTES.LABEL(slug, projectId, labelId),
    payload
  );
  return res.data.data;
}

export async function deleteLabel(
  slug: string,
  projectId: number,
  labelId: number
): Promise<void> {
  await apiClient.delete(PROJECT_ROUTES.LABEL(slug, projectId, labelId));
}
