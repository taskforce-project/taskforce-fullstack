import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

import { subscribeTopic } from "@/lib/hooks/use-stomp"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useUserStore } from "@/lib/store/user-store"
import { useCortexWork } from "./use-cortex-work"

vi.mock("@/lib/hooks/use-stomp", () => ({ subscribeTopic: vi.fn() }))

const stop = vi.fn()

/** Ce que Cortex fait pendant une réponse, annoncé par le serveur sur le canal de la personne (R137). */
describe("useCortexWork", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(subscribeTopic).mockReturnValue(stop)
    useCortexStore.setState({ sentAt: 1, conversationId: 42, workStep: null })
  })

  const deliver = (body: string) => vi.mocked(subscribeTopic).mock.calls[0][1](body)

  it("écoute le canal de la personne, tant que la conversation est montée", () => {
    useUserStore.setState({ user: { id: 7 } as never })

    const { unmount } = renderHook(() => useCortexWork())

    expect(subscribeTopic).toHaveBeenCalledWith("/topic/cortex.7", expect.any(Function))
    unmount()
    expect(stop).toHaveBeenCalled()
  })

  it("donne l'étape à la conversation ; un message illisible ne change rien", () => {
    useUserStore.setState({ user: { id: 7 } as never })
    renderHook(() => useCortexWork())

    deliver(JSON.stringify({ conversationId: 42, step: "notes", tool: null }))
    expect(useCortexStore.getState().workStep).toMatchObject({ step: "notes" })

    deliver("{not json")
    expect(useCortexStore.getState().workStep).toMatchObject({ step: "notes" })
  })

  it("sans personne connue, aucun abonnement", () => {
    useUserStore.setState({ user: null })

    renderHook(() => useCortexWork())

    expect(subscribeTopic).not.toHaveBeenCalled()
  })
})
