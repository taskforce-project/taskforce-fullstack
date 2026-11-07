import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({ usePathname: () => "/acme/projects/3", useParams: () => ({ workspace: "acme" }) }))
vi.mock("./cortex-usage", () => ({ CortexUsage: () => <span>context gauge</span> }))

import { Composer } from "./composer"
import type { AiStatus } from "@/lib/api/ai-status-service"
import { useAiStatusStore } from "@/lib/store/ai-status-store"
import { useCortexStore } from "@/lib/store/cortex-store"

const initial = useCortexStore.getState()

/** Le compositeur (R76, R123) : rien ne part sans envoi ; en colonne, le modèle et l'indicateur de contexte dessous. */
describe("Composer", () => {
  const send = vi.fn().mockResolvedValue(true)

  beforeEach(() => {
    vi.clearAllMocks()
    useCortexStore.setState({ ...initial, draft: "", turns: [], open: true, unread: false, sentAt: null, tokens: 1200, send })
    useAiStatusStore.setState({ status: { configured: true, fastModel: "qwen3:8b", chatModel: "qwen3:14b" } as AiStatus })
  })

  it("in its column, shows the model and the context indicator under it, and no toggle", () => {
    render(<Composer variant="column" />)

    expect(screen.getByText("qwen3:8b")).toBeInTheDocument()
    expect(screen.getByText("context gauge")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /conversation with Cortex/ })).toBeNull()
    expect(screen.queryByRole("group", { name: "Suggestions for this screen" })).toBeNull()
  })

  it("sends with Enter only what is written, and nothing while Cortex answers", () => {
    render(<Composer variant="column" />)
    const input = screen.getByLabelText("What do you want done?")

    fireEvent.keyDown(input, { key: "Enter" })
    expect(send).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: "Move WEB-12 to Done" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(send).toHaveBeenCalledWith("acme")

    act(() => useCortexStore.setState({ sentAt: Date.now() }))
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("replies in a conversation that has turns", () => {
    useCortexStore.setState({ turns: [{ id: "u1", role: "user", text: "Hi" }] })
    render(<Composer variant="column" />)
    expect(screen.getByLabelText("What do you want done?")).toHaveAttribute("placeholder", "Reply to Cortex…")
  })

  it("folded, unfolds the conversation and, empty, says what can be asked on this screen", () => {
    const onToggle = vi.fn()
    useCortexStore.setState({ open: false, unread: true, turns: [{ id: "u1", role: "user", text: "Hi" }] })
    render(<Composer variant="folded" onToggle={onToggle} />)

    expect(screen.getByLabelText("What do you want done?")).toHaveAttribute("placeholder", "What do you want done?")
    fireEvent.click(screen.getByRole("button", { name: "A new answer from Cortex is waiting" }))
    expect(onToggle).toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Create an issue" }))
    expect(useCortexStore.getState().draft).toBe("Create an issue ")
    expect(screen.queryByText("qwen3:8b")).toBeNull()
  })
})
