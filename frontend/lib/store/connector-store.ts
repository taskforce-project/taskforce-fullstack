import { create } from "zustand"

import { getErrorMessage } from "../api/client"
import {
  approveMcpTools,
  connectTool,
  disconnectMcpServer,
  getMcpServers,
  saveCompanyApp,
  type ConnectOutcome,
  type ConnectPayload,
  type DisconnectResult,
  type McpServerStatus,
} from "../api/integration-service"

/**
 * Le geste « Connect » d'un outil (TF-J2-12, séance n°22 R154) : pour la personne, toujours le même, un clic, le
 * navigateur, la connexion chez l'éditeur, le retour, « Connected as … ». Le serveur choisit le chemin et dit la suite
 * ({@link ConnectOutcome}) ; ce store garde cette suite par outil, l'attente du navigateur, et la dernière erreur dite
 * pour la personne. Ses actions rendent `null` ou `false` en cas d'échec, sans jamais lever.
 */
interface ConnectorState {
  /** La suite du geste, par outil (clé du connecteur) ; absente tant qu'aucun geste n'a été fait. */
  outcomes: Record<string, ConnectOutcome>
  /** L'outil dont le geste est en cours. */
  busy: string | null
  /** L'outil dont la connexion se termine dans le navigateur (app desktop : le navigateur du système). */
  waiting: string | null
  /** Le dernier échec, dit pour la personne. */
  error: string | null

  connect: (slug: string, key: string, payload: ConnectPayload) => Promise<ConnectOutcome | null>
  /** Attend que la connexion apparaisse, le temps que la personne finisse dans son navigateur. */
  waitForConnection: (slug: string, key: string, options?: WaitOptions) => Promise<boolean>
  stopWaiting: () => void
  disconnect: (slug: string, key: string, shared: boolean) => Promise<DisconnectResult | null>
  approveTools: (slug: string, key: string, shared: boolean) => Promise<McpServerStatus[] | null>
  saveCompanyApp: (slug: string, key: string, clientId: string, clientSecret: string) => Promise<boolean>
  servers: (slug: string) => Promise<McpServerStatus[] | null>
  forget: (key: string) => void
}

export interface WaitOptions {
  /** Entre deux lectures des connexions (2 s par défaut). */
  intervalMs?: number
  /** Au-delà, l'attente s'arrête (10 minutes par défaut, comme la connexion au compte). */
  timeoutMs?: number
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const useConnectorStore = create<ConnectorState>((set, get) => ({
  outcomes: {},
  busy: null,
  waiting: null,
  error: null,

  connect: async (slug, key, payload) => {
    set({ busy: key, error: null })
    try {
      const outcome = await connectTool(slug, key, payload)
      set((s) => ({ outcomes: { ...s.outcomes, [key]: outcome }, busy: null }))
      return outcome
    } catch (e) {
      set({ busy: null, error: getErrorMessage(e) })
      return null
    }
  },

  waitForConnection: async (slug, key, options = {}) => {
    const interval = options.intervalMs ?? 2_000
    const deadline = Date.now() + (options.timeoutMs ?? 10 * 60_000)
    set({ waiting: key })
    while (get().waiting === key && Date.now() < deadline) {
      await sleep(interval)
      if (get().waiting !== key) break
      try {
        const list = await getMcpServers(slug)
        if (list.some((s) => s.connectorKey === key && s.state === "CONNECTED")) {
          set({ waiting: null })
          return true
        }
      } catch {
        // Une lecture manquée n'arrête pas l'attente : la suivante dira.
      }
    }
    if (get().waiting === key) set({ waiting: null })
    return false
  },

  stopWaiting: () => set({ waiting: null }),

  disconnect: async (slug, key, shared) => {
    set({ busy: key, error: null })
    try {
      const result = await disconnectMcpServer(slug, key, shared)
      set((s) => {
        const outcomes = { ...s.outcomes }
        delete outcomes[key]
        return { outcomes, busy: null }
      })
      return result
    } catch (e) {
      set({ busy: null, error: getErrorMessage(e) })
      return null
    }
  },

  approveTools: async (slug, key, shared) => {
    set({ busy: key, error: null })
    try {
      const list = await approveMcpTools(slug, key, shared)
      set({ busy: null })
      return list
    } catch (e) {
      set({ busy: null, error: getErrorMessage(e) })
      return null
    }
  },

  saveCompanyApp: async (slug, key, clientId, clientSecret) => {
    set({ busy: key, error: null })
    try {
      await saveCompanyApp(slug, key, clientId, clientSecret)
      set({ busy: null })
      return true
    } catch (e) {
      set({ busy: null, error: getErrorMessage(e) })
      return false
    }
  },

  servers: async (slug) => {
    try {
      return await getMcpServers(slug)
    } catch (e) {
      set({ error: getErrorMessage(e) })
      return null
    }
  },

  forget: (key) =>
    set((s) => {
      const outcomes = { ...s.outcomes }
      delete outcomes[key]
      return { outcomes, error: null }
    }),
}))
