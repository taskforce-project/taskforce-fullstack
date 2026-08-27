/**
 * Service pour les opérations sur les projets.
 * Toutes les routes sont scopées par workspace slug.
 */

import { apiClient } from "./client";
import { PROJECT_ROUTES } from "../config/api-routes";

/**
 * Télécharge l'export COMPLET d'un projet (issues + descriptions + commentaires + activité) au format
 * JSON ou CSV, généré côté serveur (P1b bêta) — pour reprendre le projet dans un autre outil. Récupère le
 * blob via XHR authentifié (Bearer) puis déclenche le téléchargement navigateur.
 */
export async function downloadProjectExport(
  slug: string,
  projectId: number,
  format: "json" | "csv",
): Promise<void> {
  const res = await apiClient.get(PROJECT_ROUTES.EXPORT(slug, projectId), {
    params: { format },
    responseType: "blob",
  });
  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `project-${projectId}-export-${stamp}.${format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

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
  isFavorite: boolean;
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
  color: string;
  /** Mode « montée en compétence » (PROD-1.8 Phase 3) */
  growthMode: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectPayload {
  name: string;
  identifier: string;
  description?: string;
  isPublic?: boolean;
  iconUrl?: string;
  color?: string;
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  isPublic?: boolean;
  iconUrl?: string;
  color?: string;
  growthMode?: boolean;
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

/** Ajoute le projet aux favoris de l'utilisateur courant */
export async function favoriteProject(slug: string, id: number): Promise<Project> {
  const response = await apiClient.post<{ data: Project }>(PROJECT_ROUTES.FAVORITE(slug, id));
  return response.data.data;
}

/** Retire le projet des favoris de l'utilisateur courant */
export async function unfavoriteProject(slug: string, id: number): Promise<Project> {
  const response = await apiClient.delete<{ data: Project }>(PROJECT_ROUTES.FAVORITE(slug, id));
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
// API calls — Équipes associées (PROD-3.6b)
// ---------------------------------------------------------------------------

export interface ProjectTeam {
  teamId: number;
  name: string;
  emoji: string;
  color: string;
  memberCount: number;
}

/** Liste les équipes associées à un projet */
export async function listProjectTeams(slug: string, id: number): Promise<ProjectTeam[]> {
  const response = await apiClient.get<{ data: ProjectTeam[] }>(PROJECT_ROUTES.TEAMS(slug, id));
  return response.data.data;
}

/** Associe une équipe au projet */
export async function attachProjectTeam(slug: string, id: number, teamId: number): Promise<ProjectTeam> {
  const response = await apiClient.post<{ data: ProjectTeam }>(PROJECT_ROUTES.TEAMS(slug, id), { teamId });
  return response.data.data;
}

/** Dissocie une équipe du projet */
export async function detachProjectTeam(slug: string, id: number, teamId: number): Promise<void> {
  await apiClient.delete(PROJECT_ROUTES.TEAM(slug, id, teamId));
}

// ---------------------------------------------------------------------------
// API calls — Activité (QA2-32)
// ---------------------------------------------------------------------------

/** Un point d'activité quotidienne (issues créées ce jour-là). */
export interface ProjectActivityPoint {
  date: string; // ISO 'YYYY-MM-DD'
  count: number;
}

/** Un point de l'historique de santé : combien d'opérations étaient à risque / critiques ce jour-là. */
export interface ProjectHealthPoint {
  date: string; // ISO 'YYYY-MM-DD'
  atRisk: number;
  critical: number;
}

/**
 * Historique de santé des opérations du workspace (série continue, un point par jour).
 * `silentError` : la courbe est un complément d'information — son indisponibilité ne doit
 * pas faire surgir un toast d'erreur au chargement de la page.
 */
export async function getProjectsHealthHistory(
  slug: string,
  days = 30,
): Promise<ProjectHealthPoint[]> {
  const response = await apiClient.get<{ data: ProjectHealthPoint[] }>(
    PROJECT_ROUTES.HEALTH_HISTORY(slug),
    { params: { days }, silentError: true },
  );
  return response.data.data;
}

/** Série d'activité d'un projet, telle que renvoyée par l'appel groupé. */
export interface ProjectActivitySeries {
  projectId: number;
  points: ProjectActivityPoint[];
}

/**
 * Activité de TOUS les projets visibles du workspace, en un seul appel.
 * Évite une requête par projet affiché (sparklines de la page Operations).
 */
export async function getWorkspaceProjectsActivity(
  slug: string,
  days = 14,
): Promise<ProjectActivitySeries[]> {
  const response = await apiClient.get<{ data: ProjectActivitySeries[] }>(
    PROJECT_ROUTES.ALL_ACTIVITY(slug),
    { params: { days }, silentError: true },
  );
  return response.data.data;
}

/** Activité quotidienne du projet sur les `days` derniers jours (série continue). */
export async function getProjectActivity(
  slug: string,
  id: number,
  days = 14,
): Promise<ProjectActivityPoint[]> {
  const response = await apiClient.get<{ data: ProjectActivityPoint[] }>(
    PROJECT_ROUTES.ACTIVITY(slug, id),
    { params: { days } },
  );
  return response.data.data;
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
