import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"

// --- Capture du client STOMP mocké ---
let subscribedTopic: string | null = null
let messageHandler: ((msg: { body: string }) => void) | null = null
let deactivated = false

vi.mock("@stomp/stompjs", () => {
  class Client {
    private onConnect?: () => void
    constructor(cfg: { onConnect?: () => void }) {
      this.onConnect = cfg.onConnect
    }
    activate() {
      this.onConnect?.() // simule la connexion → déclenche subscribe()
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
vi.mock("sockjs-client", () => ({ default: class {} }))
vi.mock("@/lib/hooks/use-stomp", () => ({
  buildRealtimeUrls: () => ({ wsUrl: "ws://x/ws", sockJsUrl: "http://x/ws-sockjs" }),
}))

const mockUpsert = vi.fn()
const mockRemove = vi.fn()
vi.mock("@/lib/store/issue-store", () => ({
  useIssueStore: (selector: (s: unknown) => unknown) =>
    selector({ upsertIssueLocal: mockUpsert, removeIssueLocal: mockRemove }),
}))

import { useProjectRealtime } from "./use-project-realtime"

describe("useProjectRealtime", () => {
  beforeEach(() => {
    subscribedTopic = null
    messageHandler = null
    deactivated = false
    vi.clearAllMocks()
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
