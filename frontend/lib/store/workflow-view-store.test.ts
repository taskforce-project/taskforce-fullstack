import { beforeEach, describe, expect, it } from "vitest"

import { INSPECTOR_MAX, INSPECTOR_MIN, clampInspector, useWorkflowViewStore } from "./workflow-view-store"

/** Ce que la personne règle du workflow hors de l'adresse (séance n°25, W1) : retenu pour elle, dans le navigateur. */
describe("workflow-view-store", () => {
  beforeEach(() => {
    useWorkflowViewStore.setState({ densities: {}, inspectorWidths: {}, legendOpen: false, live: null })
  })

  it("retient la dernière densité de chaque personne", () => {
    useWorkflowViewStore.getState().setDensity("7", "summary")
    useWorkflowViewStore.getState().setDensity("8", "detail")
    const before = useWorkflowViewStore.getState()
    useWorkflowViewStore.getState().setDensity("7", "summary")
    expect(useWorkflowViewStore.getState()).toBe(before)
    expect(useWorkflowViewStore.getState().densities).toEqual({ 7: "summary", 8: "detail" })
  })

  it("retient la largeur de l'inspecteur de chaque personne, de 320 à 560 px", () => {
    useWorkflowViewStore.getState().setInspectorWidth("7", 900)
    useWorkflowViewStore.getState().setInspectorWidth("8", 100)
    useWorkflowViewStore.getState().setInspectorWidth("9", 401.6)
    expect(useWorkflowViewStore.getState().inspectorWidths).toEqual({ 7: INSPECTOR_MAX, 8: INSPECTOR_MIN, 9: 402 })
    expect(clampInspector(360)).toBe(360)
  })

  it("ouvre la légende, et garde l'état du direct du workflow ouvert", () => {
    useWorkflowViewStore.getState().setLegendOpen(true)
    expect(useWorkflowViewStore.getState().legendOpen).toBe(true)
    const live = { projectId: 3, state: "live" as const, readAt: 1 }
    useWorkflowViewStore.getState().setLive(live)
    const held = useWorkflowViewStore.getState().live
    useWorkflowViewStore.getState().setLive({ ...live })
    expect(useWorkflowViewStore.getState().live).toBe(held)
    useWorkflowViewStore.getState().setLive({ ...live, state: "offline" })
    expect(useWorkflowViewStore.getState().live?.state).toBe("offline")
    useWorkflowViewStore.getState().setLive(null)
    expect(useWorkflowViewStore.getState().live).toBeNull()
  })
})
