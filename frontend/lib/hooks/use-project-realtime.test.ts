import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"

// --- Capture du client STOMP mocké ---
interface ClientConfig {
  brokerURL?: string
  webSocketFactory?: () => unknown
  onConnect?: () => void
  onWebSocketClose?: () => void
}
let subscribedTopic: string | null = null
let messageHandler: ((msg: { body: string }) => void) | null = null
let deactivated = false
// Chaque client créé, et si sa connexion aboutit (sinon, la socket native se ferme avant : le repli SockJS).
let configs: ClientConfig[] = []
let connects = true

const SockJS = vi.hoisted(() => class {
  constructor(readonly url: string) {}
})

vi.mock("@stomp/stompjs", () => {
  class Client {
    private onConnect?: () => void
    constructor(cfg: ClientConfig) {
      this.onConnect = cfg.onConnect
      configs.push(cfg)
    }
    activate() {
      if (connects) this.onConnect?.() // simule la connexion → déclenche subscribe()
    }
    subscribe(topic: string, cb: (msg: { body: string }) => void) {
      subscribedTopic = topic
      messageHandler = cb
    }
    deactivate() {
      deactivated = true
      return Promise.resolve()
    }
  }
  return { Client }
})
vi.mock("sockjs-client", () => ({ default: SockJS }))
vi.mock("@/lib/hooks/use-stomp", () => ({
  buildRealtimeUrls: () => ({ wsUrl: "ws://x/ws", sockJsUrl: "http://x/ws-sockjs" }),
}))

const mockUpsert = vi.fn()
const mockRemove = vi.fn()
const mockUpsertRelation = vi.fn()
const mockRemoveRelation = vi.fn()
vi.mock("@/lib/store/issue-store", () => ({
  useIssueStore: (selector: (s: unknown) => unknown) =>
    selector({
      upsertIssueLocal: mockUpsert,
      removeIssueLocal: mockRemove,
      upsertRelationLocal: mockUpsertRelation,
      removeRelationLocal: mockRemoveRelation,
    }),
}))

import { useProjectRealtime } from "./use-project-realtime"

describe("useProjectRealtime", () => {
  beforeEach(() => {
    subscribedTopic = null
    messageHandler = null
    deactivated = false
    configs = []
    connects = true
    vi.clearAllMocks()
  })

  it("passe par SockJS quand la socket native se ferme avant d'avoir jamais connecté, une fois seulement (R159, L11)", async () => {
    connects = false
    renderHook(() => useProjectRealtime(30))
    expect(configs).toHaveLength(1)
    expect(configs[0].brokerURL).toBe("ws://x/ws")
    configs[0].onWebSocketClose?.()
    await waitFor(() => expect(configs).toHaveLength(2))
    expect(configs[1].brokerURL).toBeUndefined()
    expect(configs[1].webSocketFactory?.()).toEqual(new SockJS("http://x/ws-sockjs"))
    // Le repli n'a lieu qu'une fois : ni la socket native, ni SockJS ne relancent à leur tour.
    configs[0].onWebSocketClose?.()
    configs[1].onWebSocketClose?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(configs).toHaveLength(2)
  })

  it("ne s'abonne pas quand projectId est null", () => {
    renderHook(() => useProjectRealtime(null))
    expect(subscribedTopic).toBeNull()
  })

  it("s'abonne au topic du projet à la connexion", () => {
    renderHook(() => useProjectRealtime(30))
    expect(subscribedTopic).toBe("/topic/projects.30")
  })

  it("upsert l'issue du store sur un événement 'updated'", () => {
    renderHook(() => useProjectRealtime(30))
    const issue = { id: 7, title: "X" }
    messageHandler?.({ body: JSON.stringify({ action: "updated", projectId: 30, issueId: 7, issue }) })
    expect(mockUpsert).toHaveBeenCalledWith(issue)
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it("retire l'issue du store sur un événement 'deleted'", () => {
    renderHook(() => useProjectRealtime(30))
    messageHandler?.({ body: JSON.stringify({ action: "deleted", projectId: 30, issueId: 7, issue: null }) })
    expect(mockRemove).toHaveBeenCalledWith(7)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it("l'objectif et les documents d'une issue s'annoncent sans contenu : le rappel les reçoit, le store n'y touche pas", () => {
    const onChange = vi.fn()
    renderHook(() => useProjectRealtime(30, onChange))
    messageHandler?.({ body: JSON.stringify({ action: "objective.changed", projectId: 30, issueId: null, issue: null }) })
    messageHandler?.({ body: JSON.stringify({ action: "attachments.changed", projectId: 30, issueId: 7, issue: null }) })
    expect(onChange).toHaveBeenNthCalledWith(1, { action: "objective.changed", projectId: 30, issueId: null })
    expect(onChange).toHaveBeenNthCalledWith(2, { action: "attachments.changed", projectId: 30, issueId: 7 })
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it("un lien posé entre deux issues du projet entre dans ses liens (R166)", () => {
    renderHook(() => useProjectRealtime(30))
    const relation = { id: 5, relationType: "BLOCKS", source: { id: 7 }, target: { id: 8 } }
    messageHandler?.({ body: JSON.stringify({ action: "relation.added", projectId: 30, issueId: 7, issue: null, relation }) })
    expect(mockUpsertRelation).toHaveBeenCalledWith(30, relation)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it("un lien retiré quitte les liens du projet", () => {
    renderHook(() => useProjectRealtime(30))
    const relation = { id: 5, relationType: "BLOCKS", source: { id: 7 }, target: { id: 8 } }
    messageHandler?.({ body: JSON.stringify({ action: "relation.removed", projectId: 30, issueId: 7, issue: null, relation }) })
    expect(mockRemoveRelation).toHaveBeenCalledWith(30, 5)
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it("un événement de lien sans lien, ou l'activité d'une issue, ne touche à rien", () => {
    renderHook(() => useProjectRealtime(30))
    messageHandler?.({ body: JSON.stringify({ action: "relation.added", projectId: 30, issueId: 7, issue: null }) })
    messageHandler?.({ body: JSON.stringify({ action: "activity", projectId: 30, issueId: 7, issue: null }) })
    expect(mockUpsertRelation).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it("ignore un message non-JSON sans lever d'erreur", () => {
    renderHook(() => useProjectRealtime(30))
    expect(() => messageHandler?.({ body: "pas du json {" })).not.toThrow()
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it("désactive le client au démontage (cleanup)", () => {
    const { unmount } = renderHook(() => useProjectRealtime(30))
    unmount()
    expect(deactivated).toBe(true)
  })
})
