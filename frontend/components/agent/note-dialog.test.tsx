import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { useNoteStore } from "@/lib/store/note-store"
import { NoteDialog } from "./note-dialog"

const closeNote = vi.fn()

describe("NoteDialog : ce que Cortex a lu s'ouvre d'un clic (R137)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useNoteStore.setState({ title: null, note: null, loading: false, failed: false, closeNote })
  })

  it("fermée, rien ne se montre", () => {
    render(<NoteDialog />)

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("montre son nom pendant qu'elle se lit", () => {
    useNoteStore.setState({ title: "Release process", loading: true })
    render(<NoteDialog />)

    expect(screen.getByRole("heading", { name: "Release process" })).toBeInTheDocument()
    expect(screen.getByText("Opening the note…")).toBeInTheDocument()
  })

  it("montre son texte, et se ferme", () => {
    useNoteStore.setState({ title: "Release process", note: { id: 1, title: "Release process", content: "Tag, then deploy.", domain: null, updatedAt: null } })
    render(<NoteDialog />)

    expect(screen.getByText("Tag, then deploy.")).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0])
    expect(closeNote).toHaveBeenCalled()
  })

  it("dit ce qui s'est passé quand elle ne peut pas s'ouvrir", () => {
    useNoteStore.setState({ title: "Gone", failed: true })
    render(<NoteDialog />)

    expect(screen.getByRole("alert")).toHaveTextContent("can't be opened")
  })
})
