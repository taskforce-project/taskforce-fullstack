import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const reduced = vi.hoisted(() => ({ value: false }))
const kind = vi.hoisted(() => ({ voiceKind: vi.fn() }))
vi.mock("framer-motion", () => ({ useReducedMotion: () => reduced.value }))
vi.mock("@/lib/store/voice-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/voice-store")>()),
  voiceKind: kind.voiceKind,
}))

import { VoiceButton } from "./voice-button"
import { useVoiceStore } from "@/lib/store/voice-store"

/** Le micro du compositeur (R132) : une icône, un clic démarre, un clic arrête, et rien là où il n'y a pas de voix. */
describe("VoiceButton", () => {
  const press = vi.fn().mockResolvedValue(undefined)
  const cancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    reduced.value = false
    kind.voiceKind.mockReturnValue("local")
    useVoiceStore.setState({ phase: "idle", level: 0, press, cancel })
  })

  it("is not there at all where no voice exists", () => {
    kind.voiceKind.mockReturnValue(null)
    const { container } = render(<VoiceButton onText={vi.fn()} />)

    expect(container).toBeEmptyDOMElement()
  })

  it("is one icon, and its tooltip says that the audio stays here", () => {
    render(<VoiceButton onText={vi.fn()} />)

    const button = screen.getByRole("button", { name: "Voice input" })
    expect(button).toHaveAttribute("title", "Audio stays on this computer")
    expect(button).toHaveAttribute("aria-pressed", "false")
    expect(button.textContent).toBe("")
    expect(button.querySelector("svg")).toHaveClass("size-4")
  })

  it("says in the webapp who writes the text", () => {
    kind.voiceKind.mockReturnValue("browser")
    render(<VoiceButton onText={vi.fn()} />)

    expect(screen.getByRole("button", { name: "Voice input" })).toHaveAttribute("title", "Your browser's speech service writes what you say")
  })

  it("starts with one click", () => {
    const onText = vi.fn()
    render(<VoiceButton onText={onText} />)

    fireEvent.click(screen.getByRole("button", { name: "Voice input" }))

    expect(press).toHaveBeenCalledTimes(1)
  })

  it("becomes a stop square with a bar that follows the sound", () => {
    useVoiceStore.setState({ phase: "listening", level: 0.5 })
    const { container } = render(<VoiceButton onText={vi.fn()} />)

    const button = screen.getByRole("button", { name: "Stop listening" })
    expect(button).toHaveAttribute("aria-pressed", "true")
    expect(button.querySelector("svg")).toHaveClass("fill-current")
    const bar = container.querySelector("span > span") as HTMLElement
    expect(bar.style.transform).toBe("scaleX(0.5)")

    act(() => useVoiceStore.setState({ level: 0.75 }))
    expect(bar.style.transform).toBe("scaleX(0.75)")
  })

  it("under reduced motion, the bar only says whether sound arrives", () => {
    reduced.value = true
    useVoiceStore.setState({ phase: "listening", level: 0.5 })
    const { container } = render(<VoiceButton onText={vi.fn()} />)

    const bar = container.querySelector("span > span") as HTMLElement
    expect(bar.style.transform).toBe("scaleX(1)")

    act(() => useVoiceStore.setState({ level: 0.05 }))
    expect(bar.style.transform).toBe("scaleX(0)")
  })

  it.each(["starting", "transcribing"] as const)("shows that it is working while %s", (phase) => {
    useVoiceStore.setState({ phase })
    render(<VoiceButton onText={vi.fn()} />)

    const button = screen.getByRole("button", { name: "Writing what you said…" })
    expect(button).toHaveAttribute("title", "Writing what you said…")
    expect(button.querySelector("svg")).toHaveClass("motion-reduce:animate-none")
  })
})
