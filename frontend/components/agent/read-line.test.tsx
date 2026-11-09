import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import type { AssistantRead } from "@/lib/api/assistant-service"
import { useNoteStore } from "@/lib/store/note-store"
import { ReadLine } from "./read-line"

const read = (patch: Partial<AssistantRead> = {}): AssistantRead => ({ issues: [], boards: [], tools: [], notes: 0, ...patch })
const USAGE = { promptTokens: 100, completionTokens: 20, totalTokens: 120 }

const openNote = vi.fn()

/** R137 : « Je sais tjr pas c'est quoi les sources ». Le mot disparaît : la ligne grise dit ce qui a été lu, un clic nomme les notes. */
describe("ReadLine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useNoteStore.setState({ openNote })
  })

  const answer = (what: AssistantRead | null, model: string | null = "qwen3:8b") => ({ model, read: what, mode: "fast" as const, usage: USAGE })

  it("dit le modèle et ce qu'il a lu, dans une phrase, sans le mot Sources", () => {
    render(<ReadLine slug="acme" answer={answer(read({ notes: 5, boards: [{ project: "SOLO", issues: 20, open: null }], notesRead: [{ id: 1, title: "A" }] }))} />)

    expect(screen.getByLabelText("What the model read: qwen3:8b · read 5 notes and the SOLO board")).toBeInTheDocument()
    expect(screen.queryByText(/Sources/)).not.toBeInTheDocument()
  })

  it("un clic sur « 5 notes » les nomme, et chacune s'ouvre", () => {
    render(<ReadLine slug="acme" answer={answer(read({ notes: 2, notesRead: [{ id: 12, title: "Release process" }, { id: 13, title: "Roadmap" }] }))} />)

    const notes = screen.getByRole("button", { name: "2 notes" })
    expect(notes).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Release process")).not.toBeInTheDocument()

    fireEvent.click(notes)
    fireEvent.click(screen.getByRole("button", { name: "Release process" }))

    expect(notes).toHaveAttribute("aria-expanded", "true")
    expect(openNote).toHaveBeenCalledWith("acme", 12, "Release process")
    expect(screen.getByRole("button", { name: "Roadmap" })).toBeInTheDocument()
  })

  it("sans leurs noms (une réponse d'avant), les notes se comptent sans se cliquer", () => {
    render(<ReadLine slug="acme" answer={answer(read({ notes: 2 }))} />)

    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.getByLabelText("What the model read: qwen3:8b · read 2 notes")).toBeInTheDocument()
  })

  it("dit aussi que rien n'a été lu", () => {
    render(<ReadLine slug="acme" answer={answer(read())} />)

    expect(screen.getByText(/read nothing in TaskForce/)).toBeInTheDocument()
  })

  it("le modèle seul pour une réponse d'avant la ligne grise", () => {
    render(<ReadLine slug="acme" answer={answer(null)} />)

    expect(screen.getByText("qwen3:8b")).toBeInTheDocument()
  })

  it("rien sans modèle : un repli", () => {
    const { container } = render(<ReadLine slug="acme" answer={answer(read(), null)} />)

    expect(container).toBeEmptyDOMElement()
  })

  it("le mode et les tokens restent au survol", () => {
    render(<ReadLine slug="acme" answer={answer(read({ notes: 1 }))} />)

    expect(screen.getByLabelText(/What the model read/)).toHaveAttribute("title", expect.stringContaining("fast · 120 tokens (100↑ 20↓)"))
  })
})
