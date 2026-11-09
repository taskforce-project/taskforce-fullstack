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
vi.mock("@/lib/hooks/use-connector-lines", () => ({ useConnectorLines: () => [{ key: "linear", name: "Linear", reconnect: false }] }))
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
import { useModelCapabilityStore } from "@/lib/store/model-capability-store"
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
    useCortexStore.setState({ ...initial, draft: "", attachments: [], files: [], queue: [], notice: null, turns: [], open: true, unread: false, sentAt: null, stoppable: false, tokens: 1200, send })
    useAiStatusStore.setState({ status: { configured: true, fastModel: "qwen3:8b", chatModel: "qwen3:14b" } as AiStatus })
    useModelCapabilityStore.setState({ table: null, fetchTable: vi.fn().mockResolvedValue(null) })
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

  it("in its column, shows the row under the box: the project, the model that answers, the ring, and no toggle", () => {
    render(<Composer variant="column" />)

    expect(screen.getByRole("button", { name: "Model that answers: qwen3:8b" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Project of this conversation/ })).toBeInTheDocument()
    expect(screen.getByText("context gauge")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /conversation with Cortex/ })).toBeNull()
    expect(push).not.toHaveBeenCalled()
  })

  it("sends with Enter only what is written", () => {
    render(<Composer variant="column" />)
    const input = screen.getByLabelText("What do you want done?")

    fireEvent.keyDown(input, { key: "Enter" })
    expect(send).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: "Move WEB-12 to Done" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(send).toHaveBeenCalledWith("acme")
  })

  it("is a field that wraps, and Shift+Enter goes to the next line without sending", () => {
    render(<Composer variant="column" />)
    const input = screen.getByLabelText("What do you want done?")

    expect(input.tagName).toBe("TEXTAREA")
    fireEvent.change(input, { target: { value: "First line" } })
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true })
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    ["an IME composition", { isComposing: true }],
    ["the key of an IME", { keyCode: 229 }],
  ])("sends nothing during %s", (_label, event) => {
    render(<Composer variant="column" />)
    const input = screen.getByLabelText("What do you want done?")
    fireEvent.change(input, { target: { value: "にほんご" } })

    fireEvent.keyDown(input, { key: "Enter", ...event })

    expect(send).not.toHaveBeenCalled()
  })

  it("never announces « @ » or « / », and says 17 lines at most", () => {
    render(<Composer variant="column" />)
    const input = screen.getByLabelText("What do you want done?")

    expect(input.getAttribute("placeholder")).not.toMatch(/[@/]/)
    expect((input as HTMLTextAreaElement).style.maxHeight).toBe("340px")
  })

  describe("while Cortex works (R134)", () => {
    const stop = vi.fn().mockReturnValue(true)

    beforeEach(() => {
      useCortexStore.setState({ sentAt: Date.now(), stoppable: true, stop })
    })

    it("the send button is a square, and a click stops at once", () => {
      render(<Composer variant="column" />)

      expect(screen.queryByRole("button", { name: "Send" })).toBeNull()
      fireEvent.click(screen.getByRole("button", { name: "Stop" }))

      expect(stop).toHaveBeenCalledWith("acme")
    })

    it("Escape stops from the field, before anything else folds", () => {
      const parent = vi.fn()
      render(<div onKeyDown={parent}><Composer variant="column" /></div>)

      fireEvent.keyDown(screen.getByLabelText("What do you want done?"), { key: "Escape" })

      expect(stop).toHaveBeenCalledWith("acme")
      expect(parent).not.toHaveBeenCalled()
    })

    it("Escape stops from anywhere, unless something else takes it first", () => {
      render(<Composer variant="column" />)

      fireEvent.keyDown(window, { key: "Escape" })
      expect(stop).toHaveBeenCalledTimes(1)

      const dialog = document.createElement("div")
      dialog.setAttribute("role", "dialog")
      dialog.setAttribute("data-state", "open")
      document.body.append(dialog)
      fireEvent.keyDown(window, { key: "Escape" })
      expect(stop).toHaveBeenCalledTimes(1)
      dialog.remove()

      const taken = new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
      taken.preventDefault()
      window.dispatchEvent(taken)
      expect(stop).toHaveBeenCalledTimes(1)
    })

    it("Enter puts the message in the queue, visible above the box", () => {
      useCortexStore.setState({ enqueue: initial.enqueue })
      render(<Composer variant="column" />)
      const input = screen.getByLabelText("What do you want done?")
      fireEvent.change(input, { target: { value: "And then this" } })

      fireEvent.keyDown(input, { key: "Enter" })

      expect(send).not.toHaveBeenCalled()
      expect(screen.getByRole("list", { name: "Waiting to be sent" })).toHaveTextContent("And then this")
      expect(useCortexStore.getState().draft).toBe("")
    })

    it("says when five messages already wait", () => {
      useCortexStore.setState({
        enqueue: initial.enqueue,
        queue: [1, 2, 3, 4, 5].map((n) => ({ id: `q${n}`, text: `m${n}`, attachments: [], files: [] })),
      })
      render(<Composer variant="column" />)
      const input = screen.getByLabelText("What do you want done?")
      fireEvent.change(input, { target: { value: "sixth" } })

      fireEvent.keyDown(input, { key: "Enter" })

      expect(screen.getByRole("status")).toHaveTextContent("Five messages can wait at most")
      expect(useCortexStore.getState().draft).toBe("sixth")
    })

    it("a compaction shows it works, and cannot be stopped", () => {
      useCortexStore.setState({ stoppable: false })
      render(<Composer variant="column" />)

      expect(screen.queryByRole("button", { name: "Stop" })).toBeNull()
      expect(screen.getByRole("button", { name: "Send" })).toBeDisabled()
    })
  })

  describe("files (R134)", () => {
    const named = (name: string, content: string) =>
      ({ name, size: content.length, text: () => Promise.resolve(content) }) as unknown as File

    it("dropped on the box become a chip above the text, removable", async () => {
      render(<Composer variant="column" />)
      const box = screen.getByLabelText("What do you want done?").closest(".cortex-composer") as HTMLElement

      fireEvent.dragOver(box, { dataTransfer: { types: ["Files"], files: [] } })
      expect(box.className).toContain("ring-primary")
      fireEvent.drop(box, { dataTransfer: { types: ["Files"], files: [named("notes.md", "body")] } })

      expect(await screen.findByRole("button", { name: "Remove notes.md" })).toBeInTheDocument()
      expect(box.className).not.toContain("ring-primary")
      fireEvent.click(screen.getByRole("button", { name: "Remove notes.md" }))
      expect(useCortexStore.getState().files).toEqual([])
    })

    it("ignores a drag that holds no file", () => {
      render(<Composer variant="column" />)
      const box = screen.getByLabelText("What do you want done?").closest(".cortex-composer") as HTMLElement

      fireEvent.dragOver(box, { dataTransfer: { types: ["text/plain"], files: [] } })

      expect(box.className).not.toContain("ring-primary")
    })

    it("pasted, are taken; pasted text stays text", async () => {
      render(<Composer variant="column" />)
      const input = screen.getByLabelText("What do you want done?")

      fireEvent.paste(input, { clipboardData: { files: [named("data.csv", "a,b")], getData: () => "" } })
      expect(await screen.findByRole("button", { name: "Remove data.csv" })).toBeInTheDocument()

      fireEvent.paste(input, { clipboardData: { files: [named("sheet.csv", "x,y")], getData: () => "a cell" } })
      await act(async () => { await Promise.resolve() })
      expect(screen.queryByRole("button", { name: "Remove sheet.csv" })).toBeNull()
    })

    it.each([
      [["report.pdf"], "report.pdf can't be read here"],
      [["a.pdf", "b.png"], "2 files can't be read here"],
    ])("say in one line what is supported: %s", async (names, line) => {
      render(<Composer variant="column" />)
      const box = screen.getByLabelText("What do you want done?").closest(".cortex-composer") as HTMLElement

      fireEvent.drop(box, { dataTransfer: { types: ["Files"], files: names.map((name) => named(name, "x")) } })

      const notice = await screen.findByRole("status")
      expect(notice).toHaveTextContent(line)
      expect(notice).toHaveTextContent("text files and source code, up to 256 KB")
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
      expect(screen.queryByRole("status")).toBeNull()
    })

    it("say when there is no room left", async () => {
      useCortexStore.setState({ files: [1, 2, 3, 4, 5].map((n) => ({ id: `f${n}`, name: `f${n}.md`, size: 1, text: "x" })) })
      render(<Composer variant="column" />)
      const box = screen.getByLabelText("What do you want done?").closest(".cortex-composer") as HTMLElement

      fireEvent.drop(box, { dataTransfer: { types: ["Files"], files: [named("sixth.md", "x")] } })

      expect(await screen.findByRole("status")).toHaveTextContent("Five files at most")
    })
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

  it("folded, unfolds the conversation, holds no invented example, and keeps the row under the box", () => {
    const onToggle = vi.fn()
    useCortexStore.setState({ open: false, unread: true, turns: [{ id: "u1", role: "user", text: "Hi" }] })
    render(<Composer variant="folded" onToggle={onToggle} />)

    expect(screen.getByLabelText("What do you want done?")).toHaveAttribute("placeholder", "What do you want done?")
    fireEvent.click(screen.getByRole("button", { name: "A new answer from Cortex is waiting" }))
    expect(onToggle).toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Create an issue" })).toBeNull()
    expect(screen.getByRole("button", { name: "Model that answers: qwen3:8b" })).toBeInTheDocument()
    expect(screen.getByText("context gauge")).toBeInTheDocument()
  })

  it("folded and unfolded, leaves the gauge to the line of tools above the bar", () => {
    useCortexStore.setState({ open: true })
    render(<Composer variant="folded" onToggle={vi.fn()} />)
    expect(screen.queryByText("context gauge")).toBeNull()
  })
})
