import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"

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
      this.onConnect?.()
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

const { mockNotify } = vi.hoisted(() => ({ mockNotify: vi.fn() }))
vi.mock("@/lib/desktop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/desktop")>()),
  notifySystem: mockNotify,
}))

const mockPushSignal = vi.fn()
vi.mock("@/lib/store/notification-store", () => ({
  useNotificationStore: (selector: (s: unknown) => unknown) => selector({ pushSignal: mockPushSignal }),
}))

let currentUserId: number | undefined = 42
vi.mock("@/lib/store/user-store", () => ({
  useUserStore: (selector: (s: unknown) => unknown) => selector({ user: currentUserId ? { id: currentUserId } : null }),
}))

import { useNotificationsRealtime } from "./use-notifications-realtime"

describe("useNotificationsRealtime", () => {
  beforeEach(() => {
    subscribedTopic = null
    messageHandler = null
    deactivated = false
    currentUserId = 42
    vi.clearAllMocks()
  })

  it("ne s'abonne pas sans slug de workspace", () => {
    renderHook(() => useNotificationsRealtime(undefined))
    expect(subscribedTopic).toBeNull()
  })

  it("ne s'abonne pas sans utilisateur connecté", () => {
    currentUserId = undefined
    renderHook(() => useNotificationsRealtime("acme"))
    expect(subscribedTopic).toBeNull()
  })

  it("s'abonne au topic de notifications de l'utilisateur", () => {
    renderHook(() => useNotificationsRealtime("acme"))
    expect(subscribedTopic).toBe("/topic/notifications.42")
  })

  it("pousse la notification reçue dans le store", () => {
    renderHook(() => useNotificationsRealtime("acme"))
    const notif = { id: 5, title: "Nouvelle assignation", read: false }
    messageHandler?.({ body: JSON.stringify(notif) })
    expect(mockPushSignal).toHaveBeenCalledWith(notif)
  })

  it("demande une notification du système qui mène au ticket (app desktop, fenêtre en arrière-plan)", () => {
    renderHook(() => useNotificationsRealtime("acme"))
    const notif = { id: 6, title: "Assigned to you", body: "APO-12", issueUrl: "/acme/projects/5/issues/12", projectUrl: "/acme/projects/5" }
    messageHandler?.({ body: JSON.stringify(notif) })
    expect(mockNotify).toHaveBeenCalledWith({ title: "Assigned to you", body: "APO-12", path: "/acme/projects/5/issues/12" })
  })

  it("ignore un message non-JSON sans lever d'erreur", () => {
    renderHook(() => useNotificationsRealtime("acme"))
    expect(() => messageHandler?.({ body: "<< not json" })).not.toThrow()
    expect(mockPushSignal).not.toHaveBeenCalled()
  })

  it("désactive le client au démontage", () => {
    const { unmount } = renderHook(() => useNotificationsRealtime("acme"))
    unmount()
    expect(deactivated).toBe(true)
  })
})
