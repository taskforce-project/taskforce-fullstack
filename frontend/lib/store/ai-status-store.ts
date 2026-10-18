import { create } from "zustand"

import { getAiStatus, type AiStatus } from "../api/ai-status-service"

/** L'état de l'IA bouge peu (le backend le relit toutes les 30 s) : une lecture par minute suffit. */
const TTL_MS = 60_000

interface AiStatusState {
  status: AiStatus | null
  fetchedAt: number
  /** Relit l'état au plus une fois par minute (sauf `force`). Renvoie null en cas d'échec, sans lever. */
  fetchStatus: (force?: boolean) => Promise<AiStatus | null>
}

export const useAiStatusStore = create<AiStatusState>((set, get) => ({
  status: null,
  fetchedAt: 0,

  fetchStatus: async (force = false) => {
    const { status, fetchedAt } = get()
    if (!force && status && Date.now() - fetchedAt < TTL_MS) return status
    try {
      const next = await getAiStatus()
      set({ status: next, fetchedAt: Date.now() })
      return next
    } catch {
      return null
    }
  },
}))
