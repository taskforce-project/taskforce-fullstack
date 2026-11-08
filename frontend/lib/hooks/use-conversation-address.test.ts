import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"

const nav = vi.hoisted(() => ({ pathname: "/acme/projects/3", search: "", push: vi.fn(), replace: vi.fn() }))
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}))

import { useConversationAddress } from "./use-conversation-address"
import { useCortexStore } from "@/lib/store/cortex-store"

const cortex = useCortexStore.getState()

/** La conversation a son adresse (R120) : `?c=<id>`, avec le volet que dit le chemin ; retour et avant la suivent. */
describe("useConversationAddress", () => {
  const openConversation = vi.fn()
  const newConversation = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    nav.pathname = "/acme/projects/3"
    nav.search = ""
    openConversation.mockImplementation(async (_slug: string, id: number) => {
      useCortexStore.setState({ conversationId: id })
      return true
    })
    newConversation.mockImplementation(() => useCortexStore.setState({ conversationId: null }))
    useCortexStore.setState({ ...cortex, conversationId: null, openConversation, newConversation })
  })

  it("opens the conversation of the address, with the pane of the path", async () => {
    nav.search = "issue=34&c=12"
    renderHook(() => useConversationAddress("acme"))

    await waitFor(() => expect(openConversation).toHaveBeenCalledWith("acme", 12))
    expect(nav.push).not.toHaveBeenCalled()
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it("does nothing when the address already says the conversation of the window", () => {
    nav.search = "c=12"
    useCortexStore.setState({ conversationId: 12 })
    renderHook(() => useConversationAddress("acme"))

    expect(openConversation).not.toHaveBeenCalled()
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it("takes back the window's conversation when the address names one that can't open", async () => {
    openConversation.mockResolvedValue(false)
    nav.search = "issue=34&c=404"
    renderHook(() => useConversationAddress("acme"))

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/acme/projects/3?issue=34", { scroll: false }))
  })

  it("keeps the window's conversation across a link that doesn't name one", () => {
    useCortexStore.setState({ conversationId: 42 })
    nav.pathname = "/acme/dashboard"
    renderHook(() => useConversationAddress("acme"))

    expect(nav.replace).toHaveBeenCalledWith("/acme/dashboard?c=42", { scroll: false })
    expect(newConversation).not.toHaveBeenCalled()
  })

  it("starts a new conversation when the back button returns to an entry without one", () => {
    nav.search = "c=42"
    useCortexStore.setState({ conversationId: 42 })
    const { rerender } = renderHook(() => useConversationAddress("acme"))

    nav.search = ""
    act(() => { globalThis.dispatchEvent(new PopStateEvent("popstate")) })
    rerender()

    expect(newConversation).toHaveBeenCalled()
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it("gives a new conversation its id at its first answer, on the same entry of the history", () => {
    const { rerender } = renderHook(() => useConversationAddress("acme"))

    act(() => { useCortexStore.setState({ conversationId: 44 }) })
    rerender()

    expect(nav.replace).toHaveBeenCalledWith("/acme/projects/3?c=44", { scroll: false })
    expect(nav.push).not.toHaveBeenCalled()
  })

  it("adds an entry for another conversation, and for a new one", () => {
    nav.search = "c=42"
    useCortexStore.setState({ conversationId: 42 })
    const { rerender } = renderHook(() => useConversationAddress("acme"))

    act(() => { useCortexStore.setState({ conversationId: 43 }) })
    rerender()
    expect(nav.push).toHaveBeenLastCalledWith("/acme/projects/3?c=43", { scroll: false })

    nav.search = "c=43"
    rerender()
    act(() => { useCortexStore.setState({ conversationId: null }) })
    rerender()
    expect(nav.push).toHaveBeenLastCalledWith("/acme/projects/3", { scroll: false })
    expect(openConversation).not.toHaveBeenCalled()
  })

  it("waits for the workspace", () => {
    nav.search = "c=12"
    renderHook(() => useConversationAddress(""))

    expect(openConversation).not.toHaveBeenCalled()
  })
})
