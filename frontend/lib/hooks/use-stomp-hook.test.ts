import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"

// --- Clients STOMP mockés (on ne connecte pas automatiquement : le test pilote les callbacks) ---
interface MockClient {
  config: {
    onConnect?: () => void
    onStompError?: (frame: { headers: { message?: string } }) => void
    onWebSocketClose?: () => void
    brokerURL?: string
    webSocketFactory?: () => unknown
  }
  subscriptions: Array<{ topic: string; cb: (msg: { body: string }) => void }>
  activated: boolean
  deactivated: boolean
}
let clients: MockClient[] = []

vi.mock("@stomp/stompjs", () => {
  class Client {
    config: MockClient["config"]
    subscriptions: MockClient["subscriptions"] = []
    activated = false
    deactivated = false
    constructor(cfg: MockClient["config"]) {
      this.config = cfg
      clients.push(this as unknown as MockClient)
    }
    activate() { this.activated = true } // pas de connexion auto
    subscribe(topic: string, cb: (msg: { body: string }) => void) {
      this.subscriptions.push({ topic, cb })
    }
    deactivate() { this.deactivated = true; return Promise.resolve() }
  }
  return { Client }
})
vi.mock("sockjs-client", () => ({ default: class {} }))

const addMessage = vi.fn()
vi.mock("@/lib/store/message-store", () => ({
  useMessageStore: (selector: (s: unknown) => unknown) => selector({ addMessage }),
}))

import { useStomp } from "./use-stomp"

describe("useStomp", () => {
  beforeEach(() => {
    clients = []
    vi.clearAllMocks()
  })

  it("reste 'idle'/'none' sans canaux", () => {
    const { result } = renderHook(() => useStomp([]))
    expect(result.current.connectionState).toBe("idle")
    expect(result.current.transport).toBe("none")
    expect(clients).toHaveLength(0)
  })

  it("passe 'connecting' puis 'connected' et s'abonne à chaque canal", () => {
    const { result } = renderHook(() => useStomp([1, 2]))
    // Avant onConnect : connecting via WebSocket
    expect(result.current.connectionState).toBe("connecting")
    expect(result.current.transport).toBe("websocket")

    act(() => clients[0].config.onConnect?.())

    expect(result.current.connectionState).toBe("connected")
    expect(clients[0].subscriptions.map((s) => s.topic)).toEqual([
      "/topic/channel.1",
      "/topic/channel.2",
    ])
  })

  it("route les messages reçus vers le store (et ignore le non-JSON)", () => {
    renderHook(() => useStomp([7]))
    act(() => clients[0].config.onConnect?.())
    const handler = clients[0].subscriptions[0].cb

    const payload = { id: 99, content: "hello" }
    act(() => handler({ body: JSON.stringify(payload) }))
    expect(addMessage).toHaveBeenCalledWith(7, payload)

    act(() => handler({ body: "not-json {" }))
    expect(addMessage).toHaveBeenCalledTimes(1) // le non-JSON n'ajoute rien
  })

  it("expose l'erreur broker sur onStompError", () => {
    const { result } = renderHook(() => useStomp([1]))
    act(() => clients[0].config.onStompError?.({ headers: { message: "boom" } }))
    expect(result.current.connectionState).toBe("error")
    expect(result.current.lastError).toBe("boom")
  })

  it("bascule sur SockJS quand le WebSocket se ferme avant toute connexion", async () => {
    const { result } = renderHook(() => useStomp([1]))
    // Fermeture WS sans connexion préalable → planifie le fallback SockJS.
    await act(async () => {
      clients[0].config.onWebSocketClose?.()
      await Promise.resolve() // laisse deactivate().finally(...) relancer en SockJS
    })
    expect(result.current.lastError).toMatch(/sockjs/i)
    expect(result.current.transport).toBe("sockjs")
    expect(clients).toHaveLength(2) // un 2e client (SockJS) a été créé
  })

  it("désactive le client au démontage", () => {
    const { unmount } = renderHook(() => useStomp([1]))
    unmount()
    expect(clients[0].deactivated).toBe(true)
  })
})
