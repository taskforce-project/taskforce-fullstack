import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

import { SEARCH_DELAY_MS, usePickOptions } from "./use-pick-options"
import type { IssueHit } from "@/lib/api/issue-service"
import type { Project } from "@/lib/api/project-service"
import type { WorkspaceMember } from "@/lib/api/workspace-service"
import { useProjectStore } from "@/lib/store/project-store"
import { searchKey, useSearchStore } from "@/lib/store/search-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

const hit = (id: number, key: string): IssueHit => ({ id, projectId: 3, key, title: `Issue ${key}`, status: "Todo", statusCategory: "UNSTARTED" })
const project = (id: number, name: string, status: Project["status"] = "ACTIVE") =>
  ({ id, name, identifier: name.slice(0, 3).toUpperCase(), status }) as unknown as Project
const member = { id: 1, userId: 5, email: "pierre@acme.dev", displayName: "Pierre MICHEL", avatarUrl: null, role: "OWNER", joinedAt: "" } as WorkspaceMember

/** Ce que les listes du compositeur proposent (R123) : « @ », le « + », « / ». */
describe("usePickOptions", () => {
  const find = vi.fn()
  const fetchMembers = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    find.mockResolvedValue([])
    fetchMembers.mockResolvedValue([])
    useSearchStore.setState({ hits: {}, latest: {}, pending: {}, find })
    useProjectStore.setState({ projects: [project(3, "Operations"), project(4, "Old", "ARCHIVED")] })
    useWorkspaceStore.setState({ members: [], fetchMembers })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("« @ » : cherche les issues après une pause, charge les personnes une fois, et montre les trois groupes", () => {
    const { result, rerender } = renderHook(({ query }) => usePickOptions("acme", "mention", query), { initialProps: { query: "o" } })
    rerender({ query: "op" })

    act(() => { vi.advanceTimersByTime(SEARCH_DELAY_MS) })
    expect(find).toHaveBeenCalledTimes(1)
    expect(find).toHaveBeenCalledWith("acme", "op")
    expect(fetchMembers).toHaveBeenCalledTimes(1)

    act(() => {
      useSearchStore.setState({ hits: { [searchKey("acme", "op")]: [hit(35, "OPS-35")] } })
      useWorkspaceStore.setState({ members: [member] })
    })
    rerender({ query: "op" })
    expect(result.current.options.map((o) => o.id)).toEqual(["issue:35", "project:3"])
    expect(fetchMembers).toHaveBeenCalledTimes(1)
  })

  it("garde la dernière recherche de l'espace tant que la suivante cherche", () => {
    useSearchStore.setState({ latest: { acme: [hit(1, "OPS-1")] }, pending: { [searchKey("acme", "ops 3")]: true } })

    const { result } = renderHook(() => usePickOptions("acme", "attach", "ops 3"))

    expect(result.current.searching).toBe(true)
    expect(result.current.options.map((o) => o.id)).toEqual(["issue:1"])
  })

  it("le « + » : les issues et les projets, jamais les personnes ni un projet archivé", () => {
    useWorkspaceStore.setState({ members: [member] })

    const { result } = renderHook(() => usePickOptions("acme", "attach", ""))

    expect(result.current.options.map((o) => o.group)).toEqual(["projects"])
    expect(fetchMembers).not.toHaveBeenCalled()
  })

  it("« / » : les gestes de Cortex dans les mots de l'interface, sans recherche", () => {
    const { result } = renderHook(() => usePickOptions("acme", "gesture", "summ"))

    act(() => { vi.advanceTimersByTime(SEARCH_DELAY_MS) })
    expect(result.current.options).toEqual([{
      id: "gesture:summarize", group: "gestures", label: "Summarize an issue", detail: null, insert: "Summarize ", attach: null,
    }])
    expect(find).not.toHaveBeenCalled()
    expect(result.current.searching).toBe(false)
  })

  it("« /compact » est un geste comme les autres : il remplit le compositeur, il n'envoie rien", () => {
    const { result } = renderHook(() => usePickOptions("acme", "gesture", "compact"))

    expect(result.current.options).toEqual([{
      id: "gesture:compact", group: "gestures", label: "Compact this conversation", detail: null, insert: "/compact", attach: null,
    }])
  })

  it("aucune liste : rien à proposer ni à chercher", () => {
    const { result } = renderHook(() => usePickOptions("acme", null, "x"))

    act(() => { vi.advanceTimersByTime(SEARCH_DELAY_MS) })
    expect(result.current.options).toEqual([])
    expect(find).not.toHaveBeenCalled()
  })
})
