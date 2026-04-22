/**
 * Service pour les opérations sur les projets.
 * Toutes les routes sont scopées par workspace slug.
 */

import { apiClient } from "./client";
import { PROJECT_ROUTES } from "../config/api-routes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";
export type ProjectRole   = "LEAD"   | "MEMBER" | "VIEWER";

export interface ProjectMember {
  id: number;
  userId: number;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: ProjectRole;
  joinedAt: string;
}

export interface ProjectLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
  createdAt: string;
}

export interface Project {
  id: number;
  name: string;
  identifier: string;
  description: string | null;
  status: ProjectStatus;
  isPublic: boolean;
  workspaceId: number;
  workspaceSlug: string;
  createdById: number;
  createdByName: string;
  memberCount: number;
  totalIssues: number;
  openIssues: number;
  members: ProjectMember[];
  labels: ProjectLabel[];
  iconUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectPayload {
  name: string;
  identifier: string;
  description?: string;
  isPublic?: boolean;
  iconUrl?: string;
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  isPublic?: boolean;
  iconUrl?: string;
}

export interface AddProjectMemberPayload {
  email: string;
  role: ProjectRole;
}

export interface CreateLabelPayload {
  name: string;
  color?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// API calls — Projets
// ---------------------------------------------------------------------------

/** Liste tous les projets du workspace */
export async function listProjects(slug: string): Promise<Project[]> {
  const response = await apiClient.get<{ data: Project[] }>(PROJECT_ROUTES.LIST(slug));
  return response.data.data;
}

/** Crée un nouveau projet */
export async function createProject(slug: string, payload: CreateProjectPayload): Promise<Project> {
  const response = await apiClient.post<{ data: Project }>(PROJECT_ROUTES.CREATE(slug), payload);
  return response.data.data;
}

/** Récupère un projet par son id */
export async function getProject(slug: string, id: number): Promise<Project> {
  const response = await apiClient.get<{ data: Project }>(PROJECT_ROUTES.BY_ID(slug, id));
  return response.data.data;
}

/** Met à jour un projet (patch partiel) */
export async function updateProject(slug: string, id: number, payload: UpdateProjectPayload): Promise<Project> {
  const response = await apiClient.patch<{ data: Project }>(PROJECT_ROUTES.UPDATE(slug, id), payload);
  return response.data.data;
}

/** Archive un projet */
export async function archiveProject(slug: string, id: number): Promise<Project> {
  const response = await apiClient.post<{ data: Project }>(PROJECT_ROUTES.ARCHIVE(slug, id));
  return response.data.data;
}

/** Supprime définitivement un projet */
export async function deleteProject(slug: string, id: number): Promise<void> {
  await apiClient.delete(PROJECT_ROUTES.DELETE(slug, id));
}

// ---------------------------------------------------------------------------
// API calls — Membres
// ---------------------------------------------------------------------------

/** Liste les membres d'un projet */
export async function listProjectMembers(slug: string, id: number): Promise<ProjectMember[]> {
  const response = await apiClient.get<{ data: ProjectMember[] }>(PROJECT_ROUTES.MEMBERS(slug, id));
  return response.data.data;
}

/** Ajoute un membre au projet */
export async function addProjectMember(slug: string, id: number, payload: AddProjectMemberPayload): Promise<ProjectMember> {
  const response = await apiClient.post<{ data: ProjectMember }>(PROJECT_ROUTES.MEMBERS(slug, id), payload);
  return response.data.data;
}

/** Retire un membre du projet */
export async function removeProjectMember(slug: string, id: number, memberId: number): Promise<void> {
  await apiClient.delete(PROJECT_ROUTES.MEMBER(slug, id, memberId));
}

// ---------------------------------------------------------------------------
// API calls — Labels
// ---------------------------------------------------------------------------

/** Liste les labels d'un projet */
export async function listProjectLabels(slug: string, id: number): Promise<ProjectLabel[]> {
  const response = await apiClient.get<{ data: ProjectLabel[] }>(PROJECT_ROUTES.LABELS(slug, id));
  return response.data.data;
}

/** Crée un label */
export async function createProjectLabel(slug: string, id: number, payload: CreateLabelPayload): Promise<ProjectLabel> {
  const response = await apiClient.post<{ data: ProjectLabel }>(PROJECT_ROUTES.LABELS(slug, id), payload);
  return response.data.data;
}

/** Supprime un label */
export async function deleteProjectLabel(slug: string, id: number, labelId: number): Promise<void> {
  await apiClient.delete(PROJECT_ROUTES.LABEL(slug, id, labelId));
}
