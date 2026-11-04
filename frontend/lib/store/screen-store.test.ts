import { beforeEach, describe, expect, it } from "vitest"

import { useScreenStore } from "./screen-store"

/** L'issue ouverte dans sa fiche, que la barre de Cortex envoie avec chaque message (R114). */
describe("useScreenStore", () => {
  beforeEach(() => useScreenStore.setState({ openIssue: null }))

  it("keeps the issue whose sheet is open, and forgets it when that sheet closes", () => {
    useScreenStore.getState().showIssue(3, 55)
    expect(useScreenStore.getState().openIssue).toEqual({ projectId: 3, issueId: 55 })

    useScreenStore.getState().hideIssue(55)
    expect(useScreenStore.getState().openIssue).toBeNull()
  })

  it("keeps another issue opened in between", () => {
    useScreenStore.getState().showIssue(3, 55)
    useScreenStore.getState().showIssue(3, 56)

    useScreenStore.getState().hideIssue(55)

    expect(useScreenStore.getState().openIssue).toEqual({ projectId: 3, issueId: 56 })
  })
})
