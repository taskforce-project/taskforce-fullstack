import { beforeEach, describe, expect, it, vi } from "vitest"

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock("./client", () => ({ apiClient: { get, post } }))

import { getNote, searchNotes } from "./note-service"

/** Les notes de l'espace (R141) : Ctrl+K les cherche en plein texte, le volet les lit. */
describe("note-service", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("searches in full text only, silently, and keeps what a row shows", async () => {
    post.mockResolvedValue({ data: { data: [
      { node: { id: 5, title: "Runbook", content: null }, score: 0.4, excerpt: "the deploy" },
      { node: { id: 6, title: "Bare", content: null }, score: 0.1, excerpt: null },
    ] } })

    await expect(searchNotes("acme", "deploy")).resolves.toEqual([
      { id: 5, title: "Runbook", excerpt: "the deploy" },
      { id: 6, title: "Bare", excerpt: "" },
    ])
    expect(post).toHaveBeenCalledWith(
      "/api/workspaces/acme/brain/search",
      { query: "deploy", topK: 6, textOnly: true },
      { silentError: true },
    )
  })

  it("does not send a whole paragraph to the search", async () => {
    post.mockResolvedValue({ data: { data: [] } })

    await searchNotes("acme", "x".repeat(500), 3)

    expect(post.mock.calls[0][1]).toEqual({ query: "x".repeat(200), topK: 3, textOnly: true })
  })

  it("an empty answer is no result", async () => {
    post.mockResolvedValue({ data: {} })
    await expect(searchNotes("acme", "deploy")).resolves.toEqual([])
  })

  it("reads a note, silently", async () => {
    const note = { id: 5, title: "Runbook", content: "# Hi", contentUrl: null, updatedAt: null }
    get.mockResolvedValue({ data: { data: note } })

    await expect(getNote("acme", 5)).resolves.toEqual(note)
    expect(get).toHaveBeenCalledWith("/api/workspaces/acme/brain/nodes/5", { silentError: true })
  })
})
