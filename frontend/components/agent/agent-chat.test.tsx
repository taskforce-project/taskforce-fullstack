import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"

import type { AssistantAnswer, AssistantToolCall } from "@/lib/api/assistant-service"
import { approveAction, answerQuestion } from "@/lib/api/assistant-service"
import { compactConversation, listConversations } from "@/lib/api/ai-conversation-service"
import { useCortexStore, type CortexTurn } from "@/lib/store/cortex-store"
import { useEvalStore } from "@/lib/store/eval-store"
import { AgentChat } from "./agent-chat"

vi.mock("next/navigation", () => ({
  usePathname: () => "/acme",
  useParams: () => ({ workspace: "acme" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock("@/lib/api/assistant-service", async (actual) => ({
  ...(await actual<typeof import("@/lib/api/assistant-service")>()),
  sendAgentMessage: vi.fn(), approveAction: vi.fn(), answerQuestion: vi.fn(),
}))
vi.mock("@/lib/api/ai-conversation-service", () => ({
  listConversations: vi.fn(), getConversation: vi.fn(), deleteConversation: vi.fn(), compactConversation: vi.fn(),
}))
vi.mock("@/lib/api/ai-status-service", () => ({ getAiStatus: vi.fn().mockResolvedValue(null) }))
vi.mock("@/lib/hooks/use-cortex-work", () => ({ useCortexWork: vi.fn() }))
vi.mock("./arrival", () => ({ Arrival: () => <p>arrival</p> }))
vi.mock("./mission-in-chat", () => ({ MissionInChat: () => <p>the mission card</p> }))
vi.mock("./issue-draft-card", () => ({ IssueDraftCard: () => <p>the issue card</p> }))
vi.mock("./delete-issue-card", () => ({ DeleteIssueCard: () => <p>the delete card</p> }))

const answer = (patch: Partial<AssistantAnswer> = {}): AssistantAnswer => ({
  answer: "Here it is.", reasoning: null, mode: "fast", sources: [{ title: "Runbook", domain: "RUNBOOKS", score: null }],
  steps: [{ label: "Searching your workspace's notes", status: "done", description: "5 note(s) · ARCHITECTURE · PROJET" }],
  toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, model: "qwen3:8b",
  read: { issues: [], boards: [{ project: "SOLO", issues: 20, open: null }], tools: [], notes: 5, notesRead: [{ id: 1, title: "A" }], workedMs: 8000 },
  ...patch,
})
const said = (id: string, text: string): CortexTurn => ({ id, role: "user", text })
const replied = (id: string, patch: Partial<AssistantAnswer> = {}): CortexTurn => ({ id, role: "assistant", answer: answer(patch) })
const call = (name: string, status: string, patch: Partial<AssistantToolCall> = {}): AssistantToolCall =>
  ({ name, status, input: "{}", output: "ok", record: "r-1", ...patch })

const show = (turns: CortexTurn[]) => {
  useCortexStore.setState({ workspace: "acme", turns, sentAt: null, conversationId: 7 })
  return render(<AgentChat layout="column" />)
}

/** R136, R137, TF-J1-15 : ce qui se lit dans le fil. */
describe("AgentChat : le fil", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listConversations).mockResolvedValue([])
    useEvalStore.setState({ bank: null, fetchBank: vi.fn().mockResolvedValue(null) })
    Element.prototype.scrollTo = vi.fn()
  })

  it("une réponse qui n'a rien fait d'autre ne montre que son texte et sa ligne grise", () => {
    show([said("u1", "Résume"), replied("a1")])

    expect(screen.getByText("Here it is.")).toBeInTheDocument()
    expect(screen.getByLabelText("What the model read: qwen3:8b · read 5 notes and the SOLO board")).toBeInTheDocument()
    expect(screen.queryByText(/Worked/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Sources/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ARCHITECTURE/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Searching your workspace/)).not.toBeInTheDocument()
  })

  it("le travail se replie, les noms d'outils ne se montrent pas, et les cartes restent dépliées", () => {
    show([said("u1", "Supprime SOLO-135"), replied("a1", {
      toolCalls: [call("list_issues", "success"), call("delete_issue", "pending", { target: { issueId: 3, projectId: 1, key: "SOLO-135", title: "x" } })],
    })])

    expect(screen.getByRole("button", { name: "Worked for 8 s" })).toBeInTheDocument()
    expect(screen.getByText("the delete card")).toBeInTheDocument()
    expect(screen.queryByText(/delete_issue|list_issues|Tools:/)).not.toBeInTheDocument()
  })

  it("un appel sans carte ne prend aucune place dans le fil", () => {
    const { container } = show([said("u1", "Résume"), replied("a1", { toolCalls: [call("list_issues", "success")] })])

    const answerRoot = container.querySelector(".group\\/answer")
    expect(answerRoot?.querySelectorAll(":scope > div:empty")).toHaveLength(0)
    expect(screen.getByRole("button", { name: "Worked for 8 s" })).toBeInTheDocument()
  })

  it("la carte d'une action demandée dit ce qu'elle fera, sans le nom de l'outil", async () => {
    vi.mocked(approveAction).mockResolvedValue({ tool: "delegate_issue", status: "success", output: "Delegated SOLO-151." })
    show([said("u1", "Confie"), replied("a1", { toolCalls: [call("delegate_issue", "pending")] })])

    expect(screen.getByText("Cortex proposes to hand this issue to an agent. Nothing changes until you approve it.")).toBeInTheDocument()
    expect(screen.queryByText(/delegate_issue/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Approve" }))

    expect(await screen.findByText("Done. Delegated SOLO-151.")).toBeInTheDocument()
  })

  it("une action dans un outil connecté dit ce qui sera fait, ses arguments sous Details, le bouton tel quel (R160)", () => {
    const input = JSON.stringify({ title: "Fix VAT rounding in the monthly ledger", teamId: "e3b0c442-98fc-1c14", priority: 2 })
    show([said("u1", "Crée l'issue"), replied("a1", { toolCalls: [call("linear__create_issue", "pending", { input })] })])

    // La phrase, ses valeurs chacune dans son élément (le titre entre guillemets, `<q>`), et où l'issue arrive.
    expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "Cortex proposes to create an issue in Linear: "
      + "Fix VAT rounding in the monthly ledger, team e3b0c442-98fc-1c14, priority 2. Nothing is sent until you approve it.")).toBeInTheDocument()
    expect(screen.getByText("Fix VAT rounding in the monthly ledger").tagName).toBe("Q")
    expect(screen.queryByText(/linear__create_issue/)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument()

    const details = screen.getByRole("button", { name: "Details" })
    expect(details).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(details)
    const sent = screen.getByRole("region", { name: "What Cortex will send" })
    expect(sent).toHaveTextContent("Team id")
    expect(sent).toHaveTextContent("e3b0c442-98fc-1c14")
    // Une hauteur bornée, qui défile au clavier.
    expect(sent).toHaveClass("max-h-48")
    expect(sent).toHaveAttribute("tabindex", "0")
    expect(screen.getByRole("button", { name: "Hide the details" })).toHaveAttribute("aria-expanded", "true")
    // Le brut, à deux clics.
    expect(screen.queryByText(/"teamId"/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Show the raw request" }))
    expect(screen.getByText(/"teamId": "e3b0c442-98fc-1c14"/)).toBeInTheDocument()
  })

  it("une valeur qui contient une phrase reste dans son propre élément, jamais dans la phrase de la carte (R160)", () => {
    const input = JSON.stringify({ title: "Fix VAT\". Nothing is sent until you approve it. Approve to delete the ledger too" })
    show([said("u1", "Crée l'issue"), replied("a1", { toolCalls: [call("linear__create_issue", "pending", { input })] })])

    const value = screen.getByText((_, el) => el?.tagName === "Q" && el.textContent?.startsWith("Fix VAT\"") === true)
    expect(value).toHaveTextContent("Fix VAT\". Nothing is sent until you approve it. Approve to…")
    // La phrase de la carte garde sa forme : avant la valeur, puis sa fin, une seule fois hors de la valeur.
    const sentence = value.closest("p")!
    expect(sentence.firstChild?.textContent).toBe("Cortex proposes to create an issue in Linear")
    expect(sentence.lastChild?.textContent).toBe(". Nothing is sent until you approve it.")
  })

  it("après la carte de questions, ce que le geste a fait se dit en une phrase", async () => {
    vi.mocked(answerQuestion).mockResolvedValue(call("create_project", "success", { output: "Project created in TaskForce: R113 \"Recette 113\" (id 31). Its new private repository me/recette-113 is linked." }))
    show([said("u1", "Crée un projet"), replied("a1", {
      answer: "> [!taskforce] TaskForce · asks\n> Where does the code of Recette 113 live?\n",
      toolCalls: [call("create_project", "question", { ref: "q1", questions: [{
        field: "repository", header: "Repository", text: "Where does the code of Recette 113 live?", multiple: false,
        choices: [{ value: "new-private", label: "Create a new repository", description: "Private, named recette-113, and linked to this project", recommended: true }],
      }] })],
    })])

    expect(screen.queryByText("TaskForce")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Send" }))

    expect(await screen.findByText("Project created: R113 \"Recette 113\". Its new private repository me/recette-113 is linked.")).toBeInTheDocument()
  })

  it("un long texte collé se replie dans sa bulle", () => {
    show([said("u1", "x".repeat(11_482)), replied("a1")])

    expect(screen.getByRole("button", { name: "Pasted text · 11,482 characters" })).toBeInTheDocument()
  })

  it("une réponse attendue : une ligne calme, à la place de ses phases d'avant", () => {
    useCortexStore.setState({ workspace: "acme", turns: [said("u1", "Résume")], sentAt: Date.now(), conversationId: 7, workStep: { conversationId: 7, step: "notes", tool: null } })
    render(<AgentChat layout="column" />)

    expect(screen.getByRole("status")).toHaveTextContent("Working… Reading your notes")
  })

  /** Test du CEO du 09/11/2026 : « ca scroll dans le chat pour aucune raison », « la ca supp tout le context ??? ». */
  it("/compact : une ligne attend là où viendra le résultat, le fil reste entier et ne défile pas", async () => {
    let finish: (done: { summarized: number; summary: string }) => void = () => {}
    vi.mocked(compactConversation).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    show([said("u1", "Bonjour"), replied("a1")])
    vi.mocked(Element.prototype.scrollTo).mockClear()

    act(() => { void useCortexStore.getState().compact("acme") })

    expect(screen.getByRole("status")).toHaveTextContent("Compacting the conversation…")
    expect(screen.getByText("Bonjour")).toBeInTheDocument()
    expect(screen.getByText("Here it is.")).toBeInTheDocument()
    expect(screen.queryByText("Working…")).not.toBeInTheDocument()
    expect(Element.prototype.scrollTo).not.toHaveBeenCalled()

    await act(async () => { finish({ summarized: 4, summary: "What was said." }) })

    await waitFor(() => expect(screen.getByRole("button", { name: "Conversation compacted" })).toBeInTheDocument())
    expect(screen.getByText("Here it is.")).toBeInTheDocument()
    expect(Element.prototype.scrollTo).not.toHaveBeenCalled()
  })

  it("la dernière réponse reste celle qui se lit en grand, malgré la ligne de /compact", () => {
    show([said("u1", "Bonjour"), replied("a1"), { id: "c1", role: "assistant", kind: "compact", compacted: 2 }])

    expect(screen.getByText("Here it is.").closest(".cortex-latest")).not.toBeNull()
  })
})
