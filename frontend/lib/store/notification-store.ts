/**
 * Store Zustand pour les notifications de l'inbox.
 * Gère la conversion NotificationResponse → Signal et les appels API.
 */

import { create } from "zustand";
import type { NotificationResponse } from "../api/notification-service";
import {
  listNotifications,
  countUnread as countUnreadApi,
  markAsRead as markAsReadApi,
  markAllAsRead as markAllAsReadApi,
  acknowledge as acknowledgeApi,
  acknowledgeAll as acknowledgeAllApi,
} from "../api/notification-service";

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
  actor?: { name: string; initials: string; color: string };
  operation: string;
  operationUrl: string;
  title: string;
  issueId: string;
  issueUrl: string;
  timestamp: string;
  body?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Palette de couleurs déterministe pour les avatars acteurs */
const ACTOR_COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f97316",
  "#ec4899", "#06b6d4", "#84cc16", "#f59e0b",
];

function actorColor(actorId: number): string {
  return ACTOR_COLORS[actorId % ACTOR_COLORS.length];
}

/** Conversion d'une date ISO en label relatif simple */
function toRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
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
          name:     n.actor.name,
          initials: n.actor.initials,
          color:    actorColor(n.actor.id),
        }
      : undefined,
    operation:    n.projectName,
    operationUrl: n.projectUrl,
    title:        n.title,
    issueId:      n.issueIdentifier,
    issueUrl:     n.issueUrl,
    timestamp:    toRelativeTime(n.createdAt),
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

  /** Charge les notifications depuis le backend */
  fetchNotifications: (slug: string) => Promise<void>;
  /** Insère en tête une notification reçue en temps réel (STOMP). Dédup par id. */
  pushSignal: (notification: NotificationResponse) => void;
  /** Charge uniquement le compteur non-lu (ex. badge header) */
  fetchUnreadCount: (slug: string) => Promise<void>;
  /** Marque une notification comme lue (API + optimistic) */
  markAsRead: (slug: string, id: string) => Promise<void>;
  /** Marque toutes comme lues (API + optimistic) */
  markAllAsRead: (slug: string) => Promise<void>;
  /** Acquitte toutes les notifications (dismiss) + refetch */
  acknowledgeAll: (slug: string) => Promise<void>;
  /** Acquitte (dismiss) une notification unique (API + optimistic) */
  acknowledge: (slug: string, id: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  signals:     [],
  unreadCount: 0,
  isLoading:   false,

  fetchNotifications: async (slug) => {
    set({ isLoading: true });
    try {
      const data = await listNotifications(slug);
      const signals = sortByUrgency(data.map(toSignal));
      const unreadCount = signals.filter((s) => !s.read).length;
      set({ signals, unreadCount, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  pushSignal: (notification) => {
    const signal = toSignal(notification);
    set((state) => {
      // Dédup : si l'id existe déjà, on ne ré-insère pas (évite doublon avec un fetch concurrent)
      if (state.signals.some((s) => s.id === signal.id)) return state;
      return {
        signals:     sortByUrgency([signal, ...state.signals]),
        unreadCount: signal.read ? state.unreadCount : state.unreadCount + 1,
      };
    });
  },

  fetchUnreadCount: async (slug) => {
    try {
      const count = await countUnreadApi(slug);
      set({ unreadCount: count });
    } catch {
      // Silencieux — le badge n'est pas bloquant
    }
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
      // Rollback silencieux — prochaine fetch corrigera l'état
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
    } catch {
      // Rollback silencieux
    }
  },

  acknowledgeAll: async (slug) => {
    try {
      await acknowledgeAllApi(slug);
      // Refetch — les notifications acquittées sont filtrées par le backend
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
