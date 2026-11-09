import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

vi.mock("@/lib/desktop", () => ({ IS_DESKTOP: false }))
vi.mock("@/components/integrations/integrations-catalog", () => ({
  catalogForThisApp: (catalog: unknown) => catalog,
}))

import { useConnectorLines } from "./use-connector-lines"
import { useIntegrationStore } from "@/lib/store/integration-store"

const connectors = {
  catalog: { categories: [{ tools: [
    { key: "linear", name: "Linear", connected: true },
    { key: "slack", name: "Slack", connected: false },
  ] }] },
  servers: [{ connectorKey: "linear", reachable: true }],
}

/** Les connecteurs que le « + » montre (R134) : ceux qui sont connectés, lus à son ouverture. */
describe("useConnectorLines", () => {
  const fetchConnectors = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    useIntegrationStore.setState({ connectors: null, fetchConnectors } as never)
  })

  it("reads nothing while the menu is closed", () => {
    const { result } = renderHook(() => useConnectorLines("acme", false))
    expect(fetchConnectors).not.toHaveBeenCalled()
    expect(result.current).toEqual([])
  })

  it("reads the connectors when the menu opens, and keeps the connected ones", () => {
    useIntegrationStore.setState({ connectors } as never)
    const { result } = renderHook(() => useConnectorLines("acme", true))

    expect(fetchConnectors).toHaveBeenCalledWith("acme")
    expect(result.current).toEqual([{ key: "linear", name: "Linear", reconnect: false }])
  })
})
