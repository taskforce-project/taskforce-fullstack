/**
 * Service des cartes de dashboard épinglées — par utilisateur et par workspace.
 * Backend: @RequestMapping("/api/workspaces/{slug}/dashboard-cards")
 *
 * Le premier GET pour un couple (user, workspace) bootstrape les 4 cartes par
 * défaut côté serveur (persistant : elles restent supprimables ensuite).
 */
import { apiClient } from "./client";
import { AI_ROUTES, DASHBOARD_CARD_ROUTES, ISSUE_ROUTES, PROJECT_ROUTES } from "../config/api-routes";
import type { ChartSpec } from "./analytics-service";
import type { AiUsage } from "./ai-usage-service";
import type { Issue } from "./issue-service";
import type { Project } from "./project-service";

/** Largeur d'une carte dans la grille (col-span). */
export type DashboardCardSize = "1" | "2";

/** Config JSON libre d'une carte — champs connus typés, le reste ouvert. */
export interface DashboardCardConfig {
  size?: DashboardCardSize;
  /** Spec de graphe générée par l'IA (cartes `ai-chart`). */
  spec?: ChartSpec;
  [key: string]: unknown;
}

/** Miroir de DashboardCardResponse (contrat backend). */
export interface DashboardCard {
  id: number;
  cardType: string;
  title: string | null;
  config: DashboardCardConfig;
  timeRange: string | null;
  position: number;
}

export interface CreateDashboardCardPayload {
  cardType: string;
  title?: string | null;
  config?: DashboardCardConfig;
  timeRange?: string | null;
}

/** Champs absents ou null = inchangés (sémantique PATCH du contrat). */
export interface UpdateDashboardCardPayload {
  title?: string | null;
  config?: DashboardCardConfig;
  timeRange?: string | null;
}

export async function listDashboardCards(slug: string): Promise<DashboardCard[]> {
  // Chargement de fond (grille du dashboard) : la page gère son propre état d'erreur.
  const res = await apiClient.get<{ data: DashboardCard[] }>(DASHBOARD_CARD_ROUTES.LIST(slug), { silentError: true });
  return res.data.data;
}

export async function createDashboardCard(slug: string, payload: CreateDashboardCardPayload): Promise<DashboardCard> {
  const res = await apiClient.post<{ data: DashboardCard }>(DASHBOARD_CARD_ROUTES.CREATE(slug), payload);
  return res.data.data;
}

export async function updateDashboardCard(slug: string, id: number, payload: UpdateDashboardCardPayload): Promise<DashboardCard> {
  const res = await apiClient.patch<{ data: DashboardCard }>(DASHBOARD_CARD_ROUTES.UPDATE(slug, id), payload);
  return res.data.data;
}

/** Réécrit les positions 0..n dans l'ordre fourni. */
export async function reorderDashboardCards(slug: string, orderedIds: number[]): Promise<void> {
  await apiClient.put(DASHBOARD_CARD_ROUTES.REORDER(slug), { orderedIds });
}

export async function deleteDashboardCard(slug: string, id: number): Promise<void> {
  await apiClient.delete(DASHBOARD_CARD_ROUTES.DELETE(slug, id));
}

// ---------------------------------------------------------------------------
// Chargements silencieux propres au dashboard
// ---------------------------------------------------------------------------
// Les colonnes et corps de carte sont des chargements de FOND : jamais de toast
// global, chaque composant affiche son propre état vide/erreur. Les services
// d'origine n'exposent pas `silentError` pour ces appels — variantes locales.

/** Colonne « Ma file » : issues assignées à l'utilisateur (variante silencieuse de listMyIssues). */
export async function listMyIssuesQuiet(slug: string): Promise<Issue[]> {
  const res = await apiClient.get<{ data: Issue[] }>(ISSUE_ROUTES.MY_ISSUES(slug), { silentError: true });
  return res.data.data;
}

/** Carte « Usage IA » : conso du mois vs plafond (variante silencieuse de getAiUsage). */
export async function getAiUsageQuiet(slug: string): Promise<AiUsage> {
  const res = await apiClient.get<{ data: AiUsage }>(AI_ROUTES.USAGE(slug), { silentError: true });
  return res.data.data;
}

/** Graphes IA (dataset `projects`) : liste des projets (variante silencieuse de listProjects). */
export async function listProjectsQuiet(slug: string): Promise<Project[]> {
  const res = await apiClient.get<{ data: Project[] }>(PROJECT_ROUTES.LIST(slug), { silentError: true });
  return res.data.data;
}
