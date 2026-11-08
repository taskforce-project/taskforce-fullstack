import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"

const push = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
  usePathname: () => "/acme/projects/3",
  useParams: () => ({ workspace: "acme" }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}))
vi.mock("./cortex-usage", () => ({ CortexUsage: () => <span>context gauge</span> }))
vi.mock("@/lib/api/issue-service", () => ({ searchIssues: vi.fn().mockResolvedValue([]) }))
const voice = vi.hoisted(() => ({ voiceKind: vi.fn() }))
vi.mock("@/lib/store/voice-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/voice-store")>()),
  voiceKind: voice.voiceKind,
}))

import { Composer } from "./composer"
import type { AiStatus } from "@/lib/api/ai-status-service"
import { searchIssues, type IssueHit } from "@/lib/api/issue-service"
import type { Project } from "@/lib/api/project-service"
import { useAiStatusStore } from "@/lib/store/ai-status-store"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useProjectStore } from "@/lib/store/project-store"
import { searchKey, useSearchStore } from "@/lib/store/search-store"
import { useVoiceStore } from "@/lib/store/voice-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

const initial = useCortexStore.getState()
const hit: IssueHit = { id: 35, projectId: 3, key: "OPS-35", title: "Iteration #35", status: "Done", statusCategory: "COMPLETED" }

/** Le compositeur (R76, R123) : rien ne part sans envoi ; « + », « @ » et « / » ; dessous, le modèle et le contexte. */
describe("Composer", () => {
  const send = vi.fn().mockResolvedValue(true)

  beforeEach(() => {
    vi.clearAllMocks()
    // La recherche de l'espace rend la même issue que celle déjà gardée : la pause de la frappe ne la retire pas.
    vi.mocked(searchIssues).mockResolvedValue([hit])
    useCortexStore.setState({ ...initial, draft: "", attachments: [], turns: [], open: true, unread: false, sentAt: null, tokens: 1200, send })
    useAiStatusStore.setState({ status: { configured: true, fastModel: "qwen3:8b", chatModel: "qwen3:14b" } as AiStatus })
    useSearchStore.setState({ hits: { [searchKey("acme", "")]: [hit], [searchKey("acme", "ops")]: [hit] }, latest: {}, pending: {} })
    useProjectStore.setState({ projects: [{ id: 3, name: "Operations", identifier: "OPS", status: "ACTIVE" } as unknown as Project] })
    useWorkspaceStore.setState({ members: [], fetchMembers: vi.fn().mockResolvedValue([]) })
    voice.voiceKind.mockReturnValue(null)
    useVoiceStore.setState({ phase: "idle", notice: null })
  })

  describe("the microphone (R132)", () => {
    /** La personne clique sur le micro ; le store rend ce qui a été dit à ce que le compositeur lui a confié. */
    function dictate(said: string) {
      const press = vi.fn(async (_person: string | null, onText: (text: string) => void) => onText(said))
      useVoiceStore.setState({ press })
      fireEvent.click(screen.getByRole("button", { name: "Voice input" }))
      return press
    }

    it("has no microphone where no voice exists", () => {
      render(<Composer variant="column" />)
      expect(screen.queryByRole("button", { name: "Voice input" })).toBeNull()
    })

    it("sits just before the send button", () => {
      voice.voiceKind.mockReturnValue("local")
      render(<Composer variant="column" />)

      const mic = screen.getByRole("button", { name: "Voice input" })
      expect(mic.nextElementSibling).toBe(screen.getByRole("button", { name: "Send" }))
    })

    it("writes at the caret, where the text can be corrected, and sends nothing", () => {
      voice.voiceKind.mockReturnValue("local")
      useCortexStore.setState({ draft: "Move  to Done" })
      render(<Composer variant="column" />)
      const input = screen.getByLabelText("What do you want done?") as HTMLInputElement
      input.setSelectionRange(5, 5)

      dictate("WEB-12")

      expect(useCortexStore.getState().draft).toBe("Move WEB-12 to Done")
      expect(send).not.toHaveBeenCalled()
    })

    it("writes in what the person typed meanwhile", () => {
      voice.voiceKind.mockReturnValue("local")
      render(<Composer variant="column" />)
      let write: (text: string) => void = () => undefined
      useVoiceStore.setState({ press: vi.fn(async (_person: string | null, onText: (text: string) => void) => { write = onText }) })
      fireEvent.click(screen.getByRole("button", { name: "Voice input" }))

      act(() => useCortexStore.setState({ draft: "Hello" }))
      ;(screen.getByLabelText("What do you want done?") as HTMLInputElement).setSelectionRange(5, 5)
      act(() => write("there"))

      expect(useCortexStore.getState().draft).toBe("Hello there")
    })

    it("shows its one line in the composer, which keeps working", () => {
      voice.voiceKind.mockReturnValue("local")
      useVoiceStore.setState({ notice: "denied" })
      render(<Composer variant="column" />)

      expect(screen.getByText("Microphone blocked in your settings.")).toBeInTheDocument()
      const input = screen.getByLabelText("What do you want done?")
      fireEvent.change(input, { target: { value: "Move WEB-12 to Done" } })
      fireEvent.keyDown(input, { key: "Enter" })
      expect(send).toHaveBeenCalledWith("acme")
    })
  })

  it("in its column, shows the model, which opens Progress in the pane, and the context indicator, and no toggle", () => {
    render(<Composer variant="column" />)

    const model = screen.getByRole("link", { name: "qwen3:8b" })
    expect(model).toHaveAttribute("href", "/acme/progress")
    fireEvent.click(model)
    expect(push).toHaveBeenCalledWith("/acme/progress", { scroll: false })
    expect(screen.getByText("context gauge")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /conversation with Cortex/ })).toBeNull()
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

  it("« @ » opens the list from the first character; the keyboard picks an issue, which fills the text and is attached", () => {
    render(<Composer variant="column" />)
    const input = screen.getByLabelText("What do you want done?")

    fireEvent.change(input, { target: { value: "Summarize @", selectionStart: 11 } })
    const list = screen.getByRole("listbox", { name: "Suggestions for what you type" })
    expect(list).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /OPS-35/ })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("option", { name: /Operations/ })).toBeInTheDocument()

    fireEvent.keyDown(input, { key: "Enter" })

    expect(useCortexStore.getState().draft).toBe("Summarize OPS-35 ")
    expect(useCortexStore.getState().attachments).toEqual([
      { kind: "issue", projectId: 3, issueId: 35, label: "OPS-35", title: "Iteration #35" },
    ])
    // Un choix n'envoie rien.
    expect(send).not.toHaveBeenCalled()
  })

  it("the arrows move in the list, and Escape closes it before anything else", () => {
    render(<Composer variant="column" />)
    const input = screen.getByLabelText("What do you want done?")
    fireEvent.change(input, { target: { value: "@", selectionStart: 1 } })

    fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(screen.getByRole("option", { name: /Operations/ })).toHaveAttribute("aria-selected", "true")
    expect(input).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: /Operations/ }).id)
    fireEvent.keyDown(input, { key: "ArrowUp" })
    expect(screen.getByRole("option", { name: /OPS-35/ })).toHaveAttribute("aria-selected", "true")

    fireEvent.keyDown(input, { key: "Escape" })
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(input).toHaveAttribute("aria-expanded", "false")
  })

  it("« / » lists what Cortex can do; a gesture fills the composer, it never sends", () => {
    render(<Composer variant="column" />)
    const input = screen.getByLabelText("What do you want done?")

    fireEvent.change(input, { target: { value: "/mov", selectionStart: 4 } })
    fireEvent.click(screen.getByRole("option", { name: /Move an issue/ }))

    expect(useCortexStore.getState().draft).toBe("Move ")
    expect(send).not.toHaveBeenCalled()
  })

  it("shows what is attached as chips, each removed by its own button", () => {
    useCortexStore.setState({
      attachments: [
        { kind: "issue", projectId: 3, issueId: 35, label: "OPS-35", title: "Iteration #35" },
        { kind: "project", projectId: 4, issueId: null, label: "Website", title: null },
      ],
    })
    render(<Composer variant="column" />)

    const chips = screen.getByRole("list", { name: "Attached to your request" })
    expect(chips).toHaveTextContent("OPS-35")
    expect(chips).toHaveTextContent("Website")
    fireEvent.click(screen.getByRole("button", { name: "Remove Website" }))
    expect(useCortexStore.getState().attachments.map((a) => a.label)).toEqual(["OPS-35"])
  })

  it("« + » finds an issue or a project to attach, three at most", () => {
    render(<Composer variant="column" />)

    fireEvent.click(screen.getByRole("button", { name: "Attach an issue or a project" }))
    const search = screen.getByRole("combobox", { name: "Find an issue or a project" })
    fireEvent.change(search, { target: { value: "ops" } })
    fireEvent.keyDown(search, { key: "Enter" })

    expect(useCortexStore.getState().attachments.map((a) => a.label)).toEqual(["OPS-35"])
    expect(screen.queryByRole("combobox", { name: "Find an issue or a project" })).toBeNull()

    act(() => useCortexStore.setState({
      attachments: [1, 2, 3].map((id) => ({ kind: "issue" as const, projectId: 3, issueId: id, label: `OPS-${id}`, title: null })),
    }))
    expect(screen.getByRole("button", { name: "Attach an issue or a project" })).toBeDisabled()
  })

  it("folded, unfolds the conversation, and holds no invented example", () => {
    const onToggle = vi.fn()
    useCortexStore.setState({ open: false, unread: true, turns: [{ id: "u1", role: "user", text: "Hi" }] })
    render(<Composer variant="folded" onToggle={onToggle} />)

    expect(screen.getByLabelText("What do you want done?")).toHaveAttribute("placeholder", "What do you want done?")
    fireEvent.click(screen.getByRole("button", { name: "A new answer from Cortex is waiting" }))
    expect(onToggle).toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Create an issue" })).toBeNull()
    expect(screen.queryByText("qwen3:8b")).toBeNull()
  })
})
