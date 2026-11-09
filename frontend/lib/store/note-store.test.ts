import { beforeEach, describe, expect, it, vi } from "vitest"

import { getNote, type Note } from "@/lib/api/note-service"
import { noteKey, useNoteStore } from "./note-store"

vi.mock("@/lib/api/note-service", () => ({ getNote: vi.fn() }))

const note: Note = { id: 5, title: "Runbook", content: "# Hi", contentUrl: null, updatedAt: null }
const key = noteKey("acme", 5)

/** Une note ouverte dans le volet (R141). */
describe("useNoteStore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useNoteStore.setState({ notes: {}, status: {} })
  })

  it("reads a note and keeps it", async () => {
    vi.mocked(getNote).mockResolvedValue(note)

    const reading = useNoteStore.getState().fetchNote("acme", 5)
    expect(useNoteStore.getState().status[key]).toBe("loading")
    await expect(reading).resolves.toEqual(note)

    expect(useNoteStore.getState().notes[key]).toEqual(note)
    expect(useNoteStore.getState().status[key]).toBe("ready")
  })

  it.each([
    [{ response: { status: 404 } }, "missing"],
    [{ response: { status: 500 } }, "failed"],
    [new Error("down"), "failed"],
  ])("on failure gives null and says why: %j", async (error, status) => {
    vi.mocked(getNote).mockRejectedValue(error)

    await expect(useNoteStore.getState().fetchNote("acme", 5)).resolves.toBeNull()
    expect(useNoteStore.getState().status[key]).toBe(status)
  })
})
