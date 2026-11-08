import { beforeEach, describe, expect, it, vi } from "vitest"

import { searchIssues, type IssueHit } from "@/lib/api/issue-service"
import { searchKey, useSearchStore } from "./search-store"

vi.mock("@/lib/api/issue-service", () => ({ searchIssues: vi.fn() }))

const hit = (id: number, key: string): IssueHit => ({ id, projectId: 3, key, title: `Issue ${key}`, status: "Todo", statusCategory: "UNSTARTED" })

/** La recherche d'issues de la fenêtre (R123, R124) : Ctrl+K, le « @ » et le « + » du compositeur, l'arrivée. */
describe("useSearchStore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSearchStore.setState({ hits: {}, latest: {}, pending: {} })
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
})
