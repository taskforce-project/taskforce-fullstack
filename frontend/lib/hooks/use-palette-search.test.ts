import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

import { searchIssueComments, searchIssues, type IssueHit } from "@/lib/api/issue-service"
import { searchNotes } from "@/lib/api/note-service"
import { SEARCH_DELAY_MS } from "@/lib/hooks/use-pick-options"
import { useSearchStore } from "@/lib/store/search-store"
import { SETTLE_MS, usePaletteSearch } from "./use-palette-search"

vi.mock("@/lib/api/issue-service", () => ({ searchIssues: vi.fn(), searchIssueComments: vi.fn() }))
vi.mock("@/lib/api/note-service", () => ({ searchNotes: vi.fn() }))

const hit = (id: number): IssueHit => ({ id, projectId: 3, key: `OPS-${id}`, title: `Issue ${id}`, status: null, statusCategory: null })

async function flush(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

/** La recherche de Ctrl+K (R141) : par pause, sans clignoter ni faire sauter la liste. */
describe("usePaletteSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useSearchStore.setState({ hits: {}, latest: {}, pending: {}, comments: {}, notes: {} })
    vi.mocked(searchIssues).mockResolvedValue([])
    vi.mocked(searchIssueComments).mockResolvedValue([])
    vi.mocked(searchNotes).mockResolvedValue([])
  })

  afterEach(() => { vi.useRealTimers() })

  it("without text, reads the latest changed issues as soon as it opens", async () => {
    vi.mocked(searchIssues).mockResolvedValue([hit(1)])
    const { result } = renderHook(() => usePaletteSearch("acme", true))
    await flush(0)

    expect(searchIssues).toHaveBeenCalledWith("acme", "")
    expect(result.current.issues).toEqual([hit(1)])
    expect(result.current.shown).toBe("")
  })

  it("reads the latest changed issues before the first opening, so nothing jumps, and searches nothing else while closed", async () => {
    vi.mocked(searchIssues).mockResolvedValue([hit(1)])
    const { result, rerender } = renderHook(({ open }) => usePaletteSearch("acme", open), { initialProps: { open: false } })
    await flush(1000)

    expect(searchIssues).toHaveBeenCalledTimes(1)
    expect(searchIssues).toHaveBeenCalledWith("acme", "")
    expect(searchNotes).not.toHaveBeenCalled()
    expect(result.current.issues).toEqual([hit(1)])

    rerender({ open: true })
    await flush(0)
    expect(searchIssues).toHaveBeenCalledTimes(2)
  })

  it("waits for the pause, then changes everything at once", async () => {
    vi.mocked(searchIssues).mockResolvedValue([hit(2)])
    vi.mocked(searchIssueComments).mockResolvedValue([{ issueId: 9, projectId: 3, key: "OPS-9", title: "T", excerpt: "e" }])
    vi.mocked(searchNotes).mockResolvedValue([{ id: 5, title: "Runbook", excerpt: "e" }])
    const { result } = renderHook(() => usePaletteSearch("acme", true))
    await flush(0)
    vi.mocked(searchIssues).mockClear()

    act(() => { result.current.change("ops") })
    expect(result.current.query).toBe("ops")
    expect(result.current.typed).toBe("ops")
    expect(result.current.shown).toBe("")

    // Une recherche par pause, pas par touche.
    act(() => { result.current.change("ops 3") })
    await flush(SEARCH_DELAY_MS - 1)
    expect(searchIssues).not.toHaveBeenCalled()
    await flush(1)

    expect(searchIssues).toHaveBeenCalledTimes(1)
    expect(searchIssues).toHaveBeenCalledWith("acme", "ops 3")
    expect(searchIssueComments).toHaveBeenCalledWith("acme", "ops 3")
    expect(searchNotes).toHaveBeenCalledWith("acme", "ops 3")
    expect(result.current.shown).toBe("ops 3")
    expect(result.current.issues).toEqual([hit(2)])
    expect(result.current.comments).toHaveLength(1)
    expect(result.current.notes).toHaveLength(1)
    expect(result.current.failed).toBe(false)
  })

  it("does not wait for a slow answer beyond the limit", async () => {
    vi.mocked(searchNotes).mockImplementation(() => new Promise(() => {}))
    vi.mocked(searchIssues).mockImplementation(async (_, q) => (q ? [hit(4)] : []))
    const { result } = renderHook(() => usePaletteSearch("acme", true))
    await flush(0)

    act(() => { result.current.change("slow") })
    await flush(SEARCH_DELAY_MS + SETTLE_MS - 1)
    expect(result.current.shown).toBe("")
    await flush(1)

    expect(result.current.shown).toBe("slow")
    expect(result.current.issues).toEqual([hit(4)])
    expect(result.current.notes).toEqual([])
  })

  it("shows a search already done at once", async () => {
    const { result } = renderHook(() => usePaletteSearch("acme", true))
    await flush(0)
    act(() => { result.current.change("ops") })
    await flush(SEARCH_DELAY_MS)
    act(() => { result.current.change("opsx") })
    await flush(SEARCH_DELAY_MS)

    act(() => { result.current.change("ops") })

    expect(result.current.shown).toBe("ops")
  })

  it("forgets what it showed when the field is emptied", async () => {
    const { result } = renderHook(() => usePaletteSearch("acme", true))
    await flush(0)
    act(() => { result.current.change("ops") })
    await flush(SEARCH_DELAY_MS)
    expect(result.current.shown).toBe("ops")

    act(() => { result.current.change("") })
    expect(result.current.shown).toBe("")
    act(() => { result.current.change("new") })

    expect(result.current.shown).toBe("")
  })

  it("says when the search fails, and forgets it on the next one", async () => {
    vi.mocked(searchIssueComments).mockRejectedValueOnce(new Error("down"))
    const { result } = renderHook(() => usePaletteSearch("acme", true))
    await flush(0)

    act(() => { result.current.change("ops") })
    await flush(SEARCH_DELAY_MS)
    expect(result.current.failed).toBe(true)
    expect(result.current.shown).toBe("ops")

    act(() => { result.current.change("opsy") })
    expect(result.current.failed).toBe(false)
    await flush(SEARCH_DELAY_MS)
    expect(result.current.failed).toBe(false)
  })
})
