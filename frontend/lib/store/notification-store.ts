/**
 * Store Zustand pour les notifications de l'inbox.
 * Gère la conversion NotificationResponse → Signal et les appels API.
 */

import { create } from "zustand";
import type { NotificationResponse } from "../api/notification-service";
import {
  listNotifications,
  markAsRead as markAsReadApi,
  markAllAsRead as markAllAsReadApi,
  acknowledge as acknowledgeApi,
  acknowledgeAll as acknowledgeAllApi,
} from "../api/notification-service";
import { parseServerDate } from "../utils/server-date";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotifType = "mention" | "assigned" | "commented" | "statusChanged" | "dueSoon" | "overdue" | "completed";
export type Urgency   = "critical" | "warning" | "info" | "low";

export interface Signal {
  id: string;
  type: NotifType;
  urgency: Urgency;
  read: boolean;
  acknowledged: boolean;
  /** Acteur du signal. `avatarUrl`/`email` alimentent le composant partagé UserAvatar
   *  (email = seed DiceBear déterministe quand aucun avatar n'est persisté en base). */
  actor?: { name: string; initials: string; avatarUrl: string | null; email: string | null };
  operation: string;
  operationUrl: string;
  title: string;
  issueId: string;
  issueUrl: string;
  timestamp: string;
  /** Date de création renvoyée par l'API : ordre chronologique (colonne « Recent » du dashboard). */
  createdAt: string;
  body?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Conversion d'une date ISO en label relatif simple */
function toRelativeTime(isoDate: string): string {
  const diff = Date.now() - parseServerDate(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60)       return "just now";
  if (seconds < 3600)     return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400)    return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 172800)   return "Yesterday";
  return `${Math.floor(seconds / 86400)} days ago`;
}

/** Conversion NotificationResponse → Signal (shape attendue par inbox-view) */
function toSignal(n: NotificationResponse): Signal {
  return {
    id:           String(n.id),
    type:         n.type as NotifType,
    urgency:      n.urgency as Urgency,
    read:         n.read,
    acknowledged: n.acknowledged,
    actor: n.actor
      ? {
          name:      n.actor.name,
          initials:  n.actor.initials,
          avatarUrl: n.actor.avatarUrl,
          email:     n.actor.email,
        }
      : undefined,
    operation:    n.projectName,
    operationUrl: n.projectUrl,
    title:        n.title,
    issueId:      n.issueIdentifier,
    issueUrl:     n.issueUrl,
    timestamp:    toRelativeTime(n.createdAt),
    createdAt:    n.createdAt,
    body:         n.body ?? undefined,
  };
}

/** Trie les signaux par urgence (critical → warning → info → low) */
function sortByUrgency(signals: Signal[]): Signal[] {
  const order: Record<Urgency, number> = { critical: 0, warning: 1, info: 2, low: 3 };
  return [...signals].sort((a, b) => order[a.urgency] - order[b.urgency]);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface NotificationState {
  signals: Signal[];
  unreadCount: number;
  isLoading: boolean;
  /** Message d'échec du dernier chargement (null si OK) - permet à la vue de distinguer « vide » de « échec ». */
  error: string | null;
  /** Horodatage de la dernière synchro réelle (fetch ou push STOMP) - alimente l'indicateur « Live ». */
  lastSyncAt: number | null;
  /** Workspace auquel appartient la liste (null tant que rien n'a été demandé). */
  slug: string | null;
  /** Fin du dernier chargement réussi pour `slug` ; null si jamais chargé. Un push STOMP ne le pose pas. */
  fetchedAt: number | null;

  /** Charge les notifications depuis le backend */
  fetchNotifications: (slug: string) => Promise<void>;
  /**
   * Charge la liste seulement si elle manque pour ce workspace et qu'aucun chargement n'est en cours.
   * La cloche du topbar et la colonne « Recent » du dashboard l'appellent toutes deux au montage : le
   * premier lance l'appel, l'autre le réutilise (`/notifications` partait deux fois). Le sondage et les
   * resynchronisations après une action passent par `fetchNotifications`, qui recharge toujours.
   */
  ensureNotifications: (slug: string) => Promise<void>;
  /** Insère en tête une notification reçue en temps réel (STOMP). Dédup par id. */
  pushSignal: (notification: NotificationResponse) => void;
  /** Charge uniquement le compteur non-lu (ex. badge header) */
  /** Marque une notification comme lue (API + optimistic) */
  markAsRead: (slug: string, id: string) => Promise<void>;
  /** Marque toutes comme lues (API + optimistic). Renvoie `false` si l'appel échoue (échec détectable côté appelant). */
  markAllAsRead: (slug: string) => Promise<boolean>;
  /** Acquitte toutes les notifications (dismiss) + refetch */
  acknowledgeAll: (slug: string) => Promise<void>;
  /** Acquitte (dismiss) une notification unique (API + optimistic) */
  acknowledge: (slug: string, id: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  signals:     [],
  unreadCount: 0,
  isLoading:   false,
  error:       null,
  lastSyncAt:  null,
  slug:        null,
  fetchedAt:   null,

  fetchNotifications: async (slug) => {
    // Autre workspace : la liste en place n'est pas la sienne, elle ne doit pas s'afficher pendant le chargement.
    if (get().slug !== slug) {
      set({ slug, signals: [], unreadCount: 0, lastSyncAt: null, fetchedAt: null });
    }
    set({ isLoading: true, error: null });
    try {
      const data = await listNotifications(slug);
      // Réponse d'un workspace quitté entre-temps : elle écraserait la liste du nouveau.
      if (get().slug !== slug) return;
      const signals = sortByUrgency(data.map(toSignal));
      const unreadCount = signals.filter((s) => !s.read).length;
      const now = Date.now();
      set({ signals, unreadCount, isLoading: false, lastSyncAt: now, fetchedAt: now });
    } catch {
      if (get().slug !== slug) return;
      set({ isLoading: false, error: "Could not load notifications." });
    }
  },

  ensureNotifications: async (slug) => {
    const state = get();
    if (state.slug === slug && (state.isLoading || state.fetchedAt !== null)) return;
    await get().fetchNotifications(slug);
  },

  pushSignal: (notification) => {
    const signal = toSignal(notification);
    set((state) => {
      // Dédup : si l'id existe déjà, on ne ré-insère pas (évite doublon avec un fetch concurrent)
      if (state.signals.some((s) => s.id === signal.id)) return state;
      return {
        signals:     sortByUrgency([signal, ...state.signals]),
        unreadCount: signal.read ? state.unreadCount : state.unreadCount + 1,
        lastSyncAt:  Date.now(),
      };
    });
  },

  markAsRead: async (slug, id) => {
    // Optimistic update
    set((state) => ({
      signals:     state.signals.map((s) => s.id === id ? { ...s, read: true } : s),
      unreadCount: Math.max(0, state.unreadCount - (state.signals.find((s) => s.id === id && !s.read) ? 1 : 0)),
    }));
    try {
      await markAsReadApi(slug, Number(id));
    } catch {
      // Rollback silencieux - prochaine fetch corrigera l'état
    }
  },

  markAllAsRead: async (slug) => {
    // Optimistic update
    set((state) => ({
      signals:     state.signals.map((s) => ({ ...s, read: true })),
      unreadCount: 0,
    }));
    try {
      await markAllAsReadApi(slug);
      return true;
    } catch {
      // Optimiste conservé (corrigé au prochain fetch) ; l'échec est rendu détectable à l'appelant.
      return false;
    }
  },

  acknowledgeAll: async (slug) => {
    try {
      await acknowledgeAllApi(slug);
      // Refetch - les notifications acquittées sont filtrées par le backend
      await get().fetchNotifications(slug);
    } catch {
      // Silencieux
    }
  },

  acknowledge: async (slug, id) => {
    const wasUnread = Boolean(get().signals.find((s) => s.id === id && !s.read));
    // Optimistic : retire de la liste (le backend filtre les notifications acquittées)
    set((state) => ({
      signals: state.signals.filter((s) => s.id !== id),
      unreadCount: Math.max(0, state.unreadCount - (wasUnread ? 1 : 0)),
    }));
    try {
      await acknowledgeApi(slug, Number(id));
    } catch {
      // Resync en cas d'échec
      await get().fetchNotifications(slug);
    }
  },
}));
