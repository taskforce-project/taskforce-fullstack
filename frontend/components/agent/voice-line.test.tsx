import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { VoiceLine } from "./voice-line"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { useUserStore } from "@/lib/store/user-store"
import { useVoiceStore } from "@/lib/store/voice-store"
import type { VoiceNotice } from "@/lib/voice/session"
import type { AuthUser } from "@/lib/api/auth-service"

/** La ligne de la voix : rien au premier regard (R129), une phrase courte après un geste. */
describe("VoiceLine", () => {
  const acceptConsent = vi.fn().mockResolvedValue(undefined)
  const dismiss = vi.fn()
  const dismissNotice = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useUserStore.setState({ user: { id: 7 } as unknown as AuthUser })
    useVoiceStore.setState({ phase: "idle", notice: null, model: null, acceptConsent, dismiss, dismissNotice })
  })

  it("says nothing at first", () => {
    const { container } = render(<VoiceLine />)

    expect(container).toBeEmptyDOMElement()
  })

  it("says where the voice goes in the webapp, and lets the person choose", () => {
    useVoiceStore.setState({ phase: "consent" })
    render(<VoiceLine />)

    expect(screen.getByText("Your browser sends your voice to its speech service. Turn on voice, or keep typing.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Turn on voice" }))
    expect(acceptConsent).toHaveBeenCalledWith("7")
    fireEvent.click(screen.getByRole("button", { name: "Keep typing" }))
    expect(dismiss).toHaveBeenCalled()
  })

  it("has no person to remember before the account is read", () => {
    useUserStore.setState({ user: null })
    useVoiceStore.setState({ phase: "consent" })
    render(<VoiceLine />)

    fireEvent.click(screen.getByRole("button", { name: "Turn on voice" }))

    expect(acceptConsent).toHaveBeenCalledWith(null)
  })

  it("says nothing while the model gets ready: the icon shows it, there is nothing to validate", () => {
    useVoiceStore.setState({ phase: "downloading", model: { bytes: 1000, received: 237 } })
    const { container } = render(<VoiceLine />)

    expect(container).toBeEmptyDOMElement()
  })

  it.each(Object.keys(CONSTANTS_EN.voice.notices) as VoiceNotice[])("says %s in one short line, which can be dismissed", (notice) => {
    useVoiceStore.setState({ phase: "idle", notice })
    render(<VoiceLine />)

    const text = CONSTANTS_EN.voice.notices[notice]
    expect(screen.getByText(text)).toBeInTheDocument()
    expect(text.split(" ").length).toBeLessThanOrEqual(8)
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(dismissNotice).toHaveBeenCalled()
  })
})
