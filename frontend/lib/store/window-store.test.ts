import { beforeEach, describe, expect, it, vi } from "vitest"

import { useWindowStore, WINDOW_ROWS } from "./window-store"

const initial = useWindowStore.getState()

/** La fenêtre (R119 à R122) : ce que la personne en règle, retenu pour elle, hors de la route. */
describe("useWindowStore", () => {
  beforeEach(() => {
    localStorage.clear()
    useWindowStore.setState({ ...initial, paneFull: false, paneWidth: null, rightOpen: true, rightDrawer: false, rows: {}, searchOpen: false })
  })

  it("starts beside the conversation, the right panel open with its six rows folded", () => {
    expect(useWindowStore.getState()).toMatchObject({
      paneFull: false, paneWidth: null, rightOpen: true, rightDrawer: false, rows: {}, searchOpen: false,
    })
    expect(WINDOW_ROWS).toEqual(["environment", "context", "connectors", "results", "changes", "missions"])
  })

  it("puts the pane in full width and back", () => {
    useWindowStore.getState().togglePaneFull()
    expect(useWindowStore.getState().paneFull).toBe(true)
    useWindowStore.getState().togglePaneFull()
    expect(useWindowStore.getState().paneFull).toBe(false)
  })

  it("keeps the width given with the handle, rounded, and half of the place again", () => {
    useWindowStore.getState().setPaneWidth(640.4)
    expect(useWindowStore.getState().paneWidth).toBe(640)
    useWindowStore.getState().setPaneWidth(null)
    expect(useWindowStore.getState().paneWidth).toBeNull()
  })

  it("opens and closes the right panel's drawer of narrow screens", () => {
    useWindowStore.getState().setRightDrawer(true)
    expect(useWindowStore.getState().rightDrawer).toBe(true)
    useWindowStore.getState().setRightDrawer(false)
    expect(useWindowStore.getState().rightDrawer).toBe(false)
  })

  it("folds and unfolds the right panel from the title line", () => {
    useWindowStore.getState().toggleRight()
    expect(useWindowStore.getState().rightOpen).toBe(false)
    useWindowStore.getState().setRightOpen(true)
    expect(useWindowStore.getState().rightOpen).toBe(true)
  })

  it("unfolds a row and folds it back", () => {
    useWindowStore.getState().toggleRow("changes")
    expect(useWindowStore.getState().rows).toEqual({ changes: true })
    useWindowStore.getState().toggleRow("changes")
    expect(useWindowStore.getState().rows).toEqual({ changes: false })
  })

  it("opens the right panel on a row: an analysis is followed in Missions", () => {
    useWindowStore.setState({ rightOpen: false })
    useWindowStore.getState().showRow("missions")
    expect(useWindowStore.getState()).toMatchObject({ rightOpen: true, rows: { missions: true } })
  })

  it("opens and closes the search", () => {
    useWindowStore.getState().setSearchOpen(true)
    expect(useWindowStore.getState().searchOpen).toBe(true)
    useWindowStore.getState().setSearchOpen(false)
    expect(useWindowStore.getState().searchOpen).toBe(false)
  })

  it("remembers the full width, the pane's width and the right panel for the person, not the rows, the drawer nor the search", () => {
    vi.mocked(localStorage.setItem).mockClear()
    useWindowStore.getState().togglePaneFull()
    useWindowStore.getState().setPaneWidth(700)
    useWindowStore.getState().setRightOpen(false)
    useWindowStore.getState().setRightDrawer(true)
    useWindowStore.getState().toggleRow("context")
    useWindowStore.getState().setSearchOpen(true)

    const writes = vi.mocked(localStorage.setItem).mock.calls.filter(([key]) => key === "tf-window")
    const saved = JSON.parse(writes.at(-1)?.[1] ?? "{}") as { state?: Record<string, unknown> }
    expect(saved.state).toEqual({ paneFull: true, paneWidth: 700, rightOpen: false })
  })
})
