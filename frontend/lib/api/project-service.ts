/**
 * Service pour les opérations sur les projets.
 * Toutes les routes sont scopées par workspace slug.
 */

import { apiClient } from "./client";
import { PROJECT_ROUTES } from "../config/api-routes";

/**
 * Télécharge l'export COMPLET d'un projet (issues + descriptions + commentaires + activité) au format
 * JSON ou CSV, généré côté serveur (P1b bêta) - pour reprendre le projet dans un autre outil. Récupère le
 * blob via XHR authentifié (Bearer) puis déclenche le téléchargement navigateur.
 */
export async function downloadProjectExport(
  slug: string,
  projectId: number,
  format: "json" | "csv",
  onProgress?: (pct: number) => void,
): Promise<void> {
  const res = await apiClient.get(PROJECT_ROUTES.EXPORT(slug, projectId), {
    params: { format },
    responseType: "blob",
    // Progression RÉELLE du téléchargement (si le serveur envoie un Content-Length). Sinon `total`
    // est absent → on ne pousse rien (l'appelant garde une barre à 0 puis 100 à la fin).
    onDownloadProgress: onProgress
      ? (e) => {
          if (e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        }
      : undefined,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  saveBlob(res.data as Blob, `project-${projectId}-export-${stamp}.${format}`);
}

/** Déclenche le téléchargement navigateur d'un fichier reçu. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Nom de fichier d'un en-tête `Content-Disposition` (`attachment; filename="APO-2026-10-20.taskforce.zip"`). */
export function fileNameFromDisposition(header: unknown): string | null {
  if (typeof header !== "string") return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** Envoi ou téléchargement d'un fichier de projet : sans délai maximal, un gros projet peut prendre du temps. */
const NO_TIMEOUT = 0;

/**
 * Télécharge le fichier de projet TaskForce (zip) : le projet entier, avec ses tickets, leur historique et leurs
 * pièces jointes. Il s'importe dans la webapp comme dans l'app desktop, ou se garde comme sauvegarde.
 */
export async function downloadProjectBundle(
  slug: string,
  projectId: number,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const res = await apiClient.get(PROJECT_ROUTES.BUNDLE(slug, projectId), {
    responseType: "blob",
    timeout: NO_TIMEOUT,
    onDownloadProgress: onProgress
      ? (e) => {
          if (e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        }
      : undefined,
  });
  const name = fileNameFromDisposition(res.headers?.["content-disposition"]) ?? `project-${projectId}.taskforce.zip`;
  saveBlob(res.data as Blob, name);
}

/** Crée dans l'espace le projet d'un fichier de projet TaskForce, et le rend. */
export async function importProjectBundle(
  slug: string,
  file: Blob,
  onProgress?: (pct: number) => void,
): Promise<Project> {
  const response = await apiClient.post<{ data: Project }>(PROJECT_ROUTES.IMPORT(slug), file, {
    headers: { "Content-Type": "application/zip" },
    timeout: NO_TIMEOUT,
    onUploadProgress: onProgress
      ? (e) => {
          if (e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        }
      : undefined,
  });
  return response.data.data;
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
  /** Fournisseur du dépôt de code lié ("github"...), ou null (TF-AGENT-DELIVERY) */
  repoProvider: string | null;
  /** Dépôt de code lié ("owner/name"), ou null */
  repoFullName: string | null;
  /** Commande de test que le runner lance après le travail de l'agent (S1), ou null */
  testCommand?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Corps de PUT …/projects/{id}/repo : crée un dépôt (CREATE) ou lie un existant (LINK). */
export interface ProjectRepoLinkPayload {
  mode: "CREATE" | "LINK";
  /** Mode CREATE : nom du dépôt à créer. */
  repoName?: string;
  /** Mode LINK : dépôt existant "owner/name". */
  repoFullName?: string;
  /** Mode CREATE : dépôt privé (défaut true côté serveur). */
  privateRepo?: boolean;
}

/** Résultat d'un lien / délien de dépôt (repo* null quand délié). */
export interface ProjectRepoResult {
  projectId: number;
  repoProvider: string | null;
  repoFullName: string | null;
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
// API calls - Projets
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

/** Lie un dépôt de code au projet (CREATE = nouveau dépôt GitHub, LINK = existant) - TF-AGENT-DELIVERY */
export async function setProjectRepo(slug: string, id: number, payload: ProjectRepoLinkPayload): Promise<ProjectRepoResult> {
  const response = await apiClient.put<{ data: ProjectRepoResult }>(PROJECT_ROUTES.REPO(slug, id), payload);
  return response.data.data;
}

/** Pose la commande de test du projet, lancée par le runner après l'agent (S1) ; vide = aucun test lancé. */
export async function setProjectTestCommand(slug: string, id: number, testCommand: string): Promise<string | null> {
  const response = await apiClient.put<{ data: { projectId: number; testCommand: string | null } }>(
    PROJECT_ROUTES.REPO_TEST_COMMAND(slug, id), { testCommand },
  );
  return response.data.data.testCommand;
}

/** Délie le dépôt du projet */
export async function unsetProjectRepo(slug: string, id: number): Promise<ProjectRepoResult> {
  const response = await apiClient.delete<{ data: ProjectRepoResult }>(PROJECT_ROUTES.REPO(slug, id));
  return response.data.data;
}

// ---------------------------------------------------------------------------
// API calls - Membres
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
// API calls - Équipes associées (PROD-3.6b)
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
// API calls - Activité (QA2-32)
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
 * `silentError` : la courbe est un complément d'information - son indisponibilité ne doit
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

// ---------------------------------------------------------------------------
// API calls - Labels
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
