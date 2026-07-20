/**
 * Service pour les notifications de l'inbox.
 */

import { apiClient } from "./client";
import { NOTIFICATION_ROUTES } from "../config/api-routes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActorSummary {
  id: number;
  name: string;
  initials: string;
  avatarUrl: string | null;
  /** Seed déterministe de l'avatar (DiceBear) quand aucun `avatarUrl` n'est persisté. */
  email: string | null;
}

export interface NotificationResponse {
  id: number;
  type: string;
  urgency: string;
  read: boolean;
  acknowledged: boolean;
  actor: ActorSummary | null;
  title: string;
  body: string | null;
  issueIdentifier: string;
  issueUrl: string;
  projectName: string;
  projectUrl: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/** Liste les notifications non acquittées du workspace */
export async function listNotifications(slug: string): Promise<NotificationResponse[]> {
  // Appel de fond (cloche du topbar, poll 60s) : échec silencieux — jamais de toast.
  const response = await apiClient.get<{ data: NotificationResponse[] }>(NOTIFICATION_ROUTES.LIST(slug), { silentError: true });
  return response.data.data;
}

/** Nombre de notifications non lues */
export async function countUnread(slug: string): Promise<number> {
  const response = await apiClient.get<{ data: number }>(NOTIFICATION_ROUTES.UNREAD_COUNT(slug), { silentError: true });
  return response.data.data;
}

/** Marque une notification comme lue */
export async function markAsRead(slug: string, id: number): Promise<NotificationResponse> {
  const response = await apiClient.patch<{ data: NotificationResponse }>(NOTIFICATION_ROUTES.MARK_READ(slug, id));
  return response.data.data;
}

/** Marque toutes les notifications comme lues */
export async function markAllAsRead(slug: string): Promise<void> {
  await apiClient.patch(NOTIFICATION_ROUTES.MARK_ALL_READ(slug));
}

/** Acquitte (dismiss) une notification unique */
export async function acknowledge(slug: string, id: number): Promise<NotificationResponse> {
  const response = await apiClient.patch<{ data: NotificationResponse }>(NOTIFICATION_ROUTES.ACKNOWLEDGE(slug, id));
  return response.data.data;
}

/** Acquitte (dismiss) toutes les notifications */
export async function acknowledgeAll(slug: string): Promise<void> {
  await apiClient.patch(NOTIFICATION_ROUTES.ACKNOWLEDGE_ALL(slug));
}
