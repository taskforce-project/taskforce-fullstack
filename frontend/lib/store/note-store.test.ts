import { beforeEach, describe, expect, it, vi } from "vitest"

import { getNote } from "../api/note-service"
import { useNoteStore } from "./note-store"

vi.mock("../api/note-service", () => ({ getNote: vi.fn() }))

const NOTE = { id: 12, title: "Release process", content: "Steps.", domain: "RUNBOOKS", updatedAt: null }

/** Une note que Cortex a lue s'ouvre d'un clic (R137) ; un échec se dit par l'état, jamais par une exception. */
describe("useNoteStore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useNoteStore.getState().closeNote()
  })

  it("montre son nom dès le clic, puis son texte", async () => {
    let answer: (note: typeof NOTE) => void = () => {}
    vi.mocked(getNote).mockReturnValue(new Promise((resolve) => { answer = resolve }))

    const opening = useNoteStore.getState().openNote("acme", 12, "Release process")
    expect(useNoteStore.getState()).toMatchObject({ title: "Release process", loading: true, note: null, failed: false })

    answer(NOTE)
    await expect(opening).resolves.toBe(true)
    expect(getNote).toHaveBeenCalledWith("acme", 12)
    expect(useNoteStore.getState()).toMatchObject({ note: NOTE, loading: false })
  })

  it("dit qu'elle n'a pas pu être lue, sans lever", async () => {
    vi.mocked(getNote).mockRejectedValue(new Error("404"))

    await expect(useNoteStore.getState().openNote("acme", 12, "Gone")).resolves.toBe(false)

    expect(useNoteStore.getState()).toMatchObject({ title: "Gone", loading: false, failed: true, note: null })
  })

  it("se referme, et une réponse tardive ne la rouvre pas", async () => {
    let answer: (note: typeof NOTE) => void = () => {}
    vi.mocked(getNote).mockReturnValue(new Promise((resolve) => { answer = resolve }))

    const opening = useNoteStore.getState().openNote("acme", 12, "Release process")
    useNoteStore.getState().closeNote()
    answer(NOTE)
    await opening

    expect(useNoteStore.getState()).toMatchObject({ title: null, note: null, loading: false })
  })

  it("une réponse tardive en échec ne touche pas la note ouverte depuis", async () => {
    let refuse: (e: Error) => void = () => {}
    vi.mocked(getNote).mockReturnValueOnce(new Promise((_, reject) => { refuse = reject }))
    const first = useNoteStore.getState().openNote("acme", 1, "First")
    vi.mocked(getNote).mockResolvedValueOnce(NOTE)
    await useNoteStore.getState().openNote("acme", 12, "Release process")

    refuse(new Error("late"))
    await first

    expect(useNoteStore.getState()).toMatchObject({ note: NOTE, failed: false, title: "Release process" })
  })
})
