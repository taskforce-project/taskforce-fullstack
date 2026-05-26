import { create } from "zustand"
import {
  listChannels,
  listMessages,
  editMessage,
  deleteMessage,
  type ChannelSummary,
  type ApiChatMessage,
} from "../api/message-service"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessageState {
  channels:          ChannelSummary[]
  activeChannelId:   number | null
  messagesByChannel: Record<number, ApiChatMessage[]>
  loadingChannels:   boolean
  loadingMessages:   boolean
  error:             string | null
}

interface MessageActions {
  fetchChannels:    (slug: string) => Promise<void>
  fetchMessages:    (slug: string, channelId: number) => Promise<void>
  setActiveChannel: (id: number) => void
  /** Ajoute un message reçu via WebSocket */
  addMessage:       (channelId: number, msg: ApiChatMessage) => void
  /** Met à jour un message (edition REST) */
  updateMessage:    (slug: string, channelId: number, msgId: number, content: string) => Promise<void>
  /** Supprime un message (soft delete REST) */
  removeMessage:    (slug: string, channelId: number, msgId: number) => Promise<void>
  clearError:       () => void
}

type MessageStore = MessageState & MessageActions

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMessageStore = create<MessageStore>((set, get) => ({
  channels:          [],
  activeChannelId:   null,
  messagesByChannel: {},
  loadingChannels:   false,
  loadingMessages:   false,
  error:             null,

  fetchChannels: async (slug) => {
    set({ loadingChannels: true, error: null })
    try {
      const channels = await listChannels(slug)
      set({ channels, loadingChannels: false })
    } catch {
      set({ error: "Impossible de charger les canaux", loadingChannels: false })
    }
  },

  fetchMessages: async (slug, channelId) => {
    set({ loadingMessages: true, error: null })
    try {
      const messages = await listMessages(slug, channelId)
      set((s) => ({
        messagesByChannel: { ...s.messagesByChannel, [channelId]: messages },
        loadingMessages: false,
      }))
    } catch {
      set({ error: "Impossible de charger les messages", loadingMessages: false })
    }
  },

  setActiveChannel: (id) => set({ activeChannelId: id }),

  addMessage: (channelId, msg) =>
    set((s) => {
      const existing = s.messagesByChannel[channelId] ?? []
      // Éviter les doublons si le message est déjà présent (optimistic update)
      if (existing.some((m) => m.id === msg.id)) return s
      return { messagesByChannel: { ...s.messagesByChannel, [channelId]: [...existing, msg] } }
    }),

  updateMessage: async (slug, channelId, msgId, content) => {
    try {
      const updated = await editMessage(slug, channelId, msgId, content)
      set((s) => ({
        messagesByChannel: {
          ...s.messagesByChannel,
          [channelId]: (s.messagesByChannel[channelId] ?? []).map((m) =>
            m.id === msgId ? updated : m
          ),
        },
      }))
    } catch {
      set({ error: "Impossible de modifier le message" })
    }
  },

  removeMessage: async (slug, channelId, msgId) => {
    try {
      await deleteMessage(slug, channelId, msgId)
      set((s) => ({
        messagesByChannel: {
          ...s.messagesByChannel,
          [channelId]: (s.messagesByChannel[channelId] ?? []).filter((m) => m.id !== msgId),
        },
      }))
    } catch {
      set({ error: "Impossible de supprimer le message" })
    }
  },

  clearError: () => set({ error: null }),
}))
