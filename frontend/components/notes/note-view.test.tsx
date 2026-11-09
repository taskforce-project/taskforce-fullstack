import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useParams: () => ({ workspace: "acme" }) }))

import { NoteView } from "./note-view"
import type { Note } from "@/lib/api/note-service"
import { noteKey, useNoteStore } from "@/lib/store/note-store"

const note: Note = { id: 5, title: "Runbook", content: "Roll the **deploy**", contentUrl: "https://example.org/doc", updatedAt: "2026-11-08T10:00:00" }
const key = noteKey("acme", 5)

/** Une note dans le volet (R141) : on la lit, et un échec dit quoi faire. */
describe("NoteView", () => {
  const fetchNote = vi.fn().mockResolvedValue(null)

  beforeEach(() => {
    vi.clearAllMocks()
    useNoteStore.setState({ notes: {}, status: {}, fetchNote })
  })

  it("reads the note: title, when it changed, text, source", () => {
    useNoteStore.setState({ notes: { [key]: note }, status: { [key]: "ready" } })
    render(<NoteView id={5} />)

    expect(fetchNote).toHaveBeenCalledWith("acme", 5)
    expect(screen.getByRole("heading", { name: "Runbook" })).toBeInTheDocument()
    expect(screen.getByText(/^Updated /)).toBeInTheDocument()
    expect(screen.getByText("deploy")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open the original" })).toHaveAttribute("href", "https://example.org/doc")
  })

  it("says when a note has no text", () => {
    useNoteStore.setState({ notes: { [key]: { ...note, content: null, contentUrl: null, updatedAt: null } }, status: { [key]: "ready" } })
    render(<NoteView id={5} />)

    expect(screen.getByText("This note is empty.")).toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("loads without saying anything", () => {
    useNoteStore.setState({ status: { [key]: "loading" } })
    const { container } = render(<NoteView id={5} />)

    expect(container.textContent).toBe("")
  })

  it("a note that isn't there says so in one line", () => {
    useNoteStore.setState({ status: { [key]: "missing" } })
    render(<NoteView id={5} />)

    expect(screen.getByText(/isn't there any more/)).toBeInTheDocument()
  })

  it("an address that isn't a note says so too, and asks nothing", () => {
    render(<NoteView id={Number("x")} />)

    expect(fetchNote).not.toHaveBeenCalled()
    expect(screen.getByText(/isn't there any more/)).toBeInTheDocument()
  })

  it("a failure says what to do, and retries", () => {
    useNoteStore.setState({ status: { [key]: "failed" } })
    render(<NoteView id={5} />)

    expect(screen.getByText(/Couldn't open this note. Check your connection/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(fetchNote).toHaveBeenCalledTimes(2)
  })
})
