import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const kind = vi.hoisted(() => ({ voiceKind: vi.fn() }))
vi.mock("@/lib/store/voice-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/voice-store")>()),
  voiceKind: kind.voiceKind,
}))

import { useVoiceInput } from "./use-voice-input"
import { useUserStore } from "@/lib/store/user-store"
import { useVoiceStore } from "@/lib/store/voice-store"
import type { AuthUser } from "@/lib/api/auth-service"

describe("useVoiceInput", () => {
  const press = vi.fn().mockResolvedValue(undefined)
  const cancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    kind.voiceKind.mockReturnValue("local")
    useUserStore.setState({ user: { id: 7 } as unknown as AuthUser })
    useVoiceStore.setState({ phase: "idle", press, cancel })
  })

  afterEach(() => {
    useVoiceStore.setState({ phase: "idle" })
    useUserStore.setState({ user: null })
  })

  it("says which voice exists", () => {
    const { result } = renderHook(() => useVoiceInput(vi.fn()))
    expect(result.current.kind).toBe("local")
  })

  it("presses for the person, and writes through the latest callback", () => {
    const first = vi.fn()
    const second = vi.fn()
    const { result, rerender } = renderHook(({ onText }) => useVoiceInput(onText), { initialProps: { onText: first } })

    act(() => result.current.press())
    rerender({ onText: second })
    const write = press.mock.calls[0]?.[1] as (text: string) => void
    write("Hello")

    expect(press).toHaveBeenCalledWith("7", expect.any(Function))
    expect(result.current.person).toBe("7")
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith("Hello")
  })

  it("has no person before the account is read", () => {
    useUserStore.setState({ user: null })
    const { result } = renderHook(() => useVoiceInput(vi.fn()))

    act(() => result.current.press())

    expect(press).toHaveBeenCalledWith(null, expect.any(Function))
  })

  it.each(["starting", "listening", "transcribing"] as const)("Escape cancels while %s, and goes no further", (phase) => {
    useVoiceStore.setState({ phase })
    renderHook(() => useVoiceInput(vi.fn()))
    const further = vi.fn()
    document.addEventListener("keydown", further)

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    act(() => {
      document.dispatchEvent(event)
    })

    expect(cancel).toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
    expect(further).not.toHaveBeenCalled()
    document.removeEventListener("keydown", further)
  })

  it("leaves other keys and idle moments alone", () => {
    useVoiceStore.setState({ phase: "listening" })
    const { rerender } = renderHook(() => useVoiceInput(vi.fn()))

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }))
    })
    expect(cancel).not.toHaveBeenCalled()

    act(() => useVoiceStore.setState({ phase: "idle" }))
    rerender()
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    expect(cancel).not.toHaveBeenCalled()
  })

  it("closes the microphone when the composer goes away", () => {
    const { unmount } = renderHook(() => useVoiceInput(vi.fn()))

    unmount()

    expect(cancel).toHaveBeenCalled()
  })
})
