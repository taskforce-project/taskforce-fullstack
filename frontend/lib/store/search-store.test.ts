import { beforeEach, describe, expect, it, vi } from "vitest"

import { searchIssueComments, searchIssues, type IssueCommentHit, type IssueHit } from "@/lib/api/issue-service"
import { searchNotes, type NoteHit } from "@/lib/api/note-service"
import { searchKey, useSearchStore } from "./search-store"

vi.mock("@/lib/api/issue-service", () => ({ searchIssues: vi.fn(), searchIssueComments: vi.fn() }))
vi.mock("@/lib/api/note-service", () => ({ searchNotes: vi.fn() }))

const hit = (id: number, key: string): IssueHit => ({ id, projectId: 3, key, title: `Issue ${key}`, status: "Todo", statusCategory: "UNSTARTED" })
const comment: IssueCommentHit = { issueId: 9, projectId: 3, key: "OPS-9", title: "Quiet", excerpt: "the deploy failed" }
const note: NoteHit = { id: 5, title: "Runbook", excerpt: "roll the deploy" }

/** La recherche d'issues de la fenêtre (R123, R124) : Ctrl+K, le « @ » et le « + » du compositeur, l'arrivée. */
describe("useSearchStore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSearchStore.setState({ hits: {}, latest: {}, pending: {}, comments: {}, notes: {} })
  })

  it("cherche, garde ce qu'elle a trouvé sous son espace et son texte, et le rend", async () => {
    vi.mocked(searchIssues).mockResolvedValue([hit(35, "OPS-35")])

    const search = useSearchStore.getState().find("acme", "  OPS-35 ")
    expect(useSearchStore.getState().pending[searchKey("acme", "OPS-35")]).toBe(true)
    await expect(search).resolves.toEqual([hit(35, "OPS-35")])

    expect(searchIssues).toHaveBeenCalledWith("acme", "OPS-35")
    expect(useSearchStore.getState().hits[searchKey("acme", "ops-35")]).toEqual([hit(35, "OPS-35")])
    expect(useSearchStore.getState().latest.acme).toEqual([hit(35, "OPS-35")])
    expect(useSearchStore.getState().pending).toEqual({})
  })

  it("un échec rend null et garde la recherche d'avant", async () => {
    vi.mocked(searchIssues).mockResolvedValueOnce([hit(1, "OPS-1")]).mockRejectedValueOnce(new Error("down"))
    await useSearchStore.getState().find("acme", "")

    await expect(useSearchStore.getState().find("acme", "")).resolves.toBeNull()
    expect(useSearchStore.getState().hits[searchKey("acme", "")]).toEqual([hit(1, "OPS-1")])
    expect(useSearchStore.getState().pending).toEqual({})
  })

  it("rien sans espace", async () => {
    await expect(useSearchStore.getState().find("", "OPS")).resolves.toBeNull()
    expect(searchIssues).not.toHaveBeenCalled()
  })

  it("garde trente recherches au plus : les plus anciennes partent", async () => {
    vi.mocked(searchIssues).mockResolvedValue([])
    for (let i = 0; i < 35; i++) await useSearchStore.getState().find("acme", `q${i}`)

    const hits = useSearchStore.getState().hits
    expect(Object.keys(hits)).toHaveLength(30)
    expect(hits[searchKey("acme", "q0")]).toBeUndefined()
    expect(hits[searchKey("acme", "q34")]).toEqual([])
  })

  describe("findInside : ce qui est écrit (R141)", () => {
    const key = searchKey("acme", "deploy")

    it("garde les commentaires et les notes sous la même recherche", async () => {
      vi.mocked(searchIssueComments).mockResolvedValue([comment])
      vi.mocked(searchNotes).mockResolvedValue([note])

      await expect(useSearchStore.getState().findInside("acme", " deploy ")).resolves.toBe(true)

      expect(searchIssueComments).toHaveBeenCalledWith("acme", "deploy")
      expect(searchNotes).toHaveBeenCalledWith("acme", "deploy")
      expect(useSearchStore.getState().comments[key]).toEqual([comment])
      expect(useSearchStore.getState().notes[key]).toEqual([note])
    })

    it.each([
      ["comments", searchIssueComments, searchNotes, "notes", [note]],
      ["notes", searchNotes, searchIssueComments, "comments", [comment]],
    ] as const)("les %s en échec : l'autre réponse reste, et false le dit", async (failing, down, up, other, kept) => {
      vi.mocked(down).mockRejectedValue(new Error("down"))
      vi.mocked(up as typeof searchNotes).mockResolvedValue(kept as unknown as NoteHit[])

      await expect(useSearchStore.getState().findInside("acme", "deploy")).resolves.toBe(false)

      expect(useSearchStore.getState()[failing][key]).toEqual([])
      expect(useSearchStore.getState()[other][key]).toEqual(kept)
    })

    it("une seule lettre n'appelle pas le serveur, qui ne chercherait rien", async () => {
      await expect(useSearchStore.getState().findInside("acme", "d")).resolves.toBe(true)

      expect(searchNotes).not.toHaveBeenCalled()
      expect(useSearchStore.getState().notes[searchKey("acme", "d")]).toEqual([])
    })

    it("rien sans espace", async () => {
      await expect(useSearchStore.getState().findInside("", "deploy")).resolves.toBe(false)
      expect(searchNotes).not.toHaveBeenCalled()
    })
  })
})
