import { describe, expect, it } from "vitest"

import type { ConnectorView, IntegrationCatalog } from "@/lib/api/integration-service"
import { catalogForThisApp } from "./integrations-catalog"

const tool = (key: string, connected: boolean) => ({ key, name: key, connected }) as unknown as ConnectorView

const catalog: IntegrationCatalog = {
  total: 4,
  connected: 2,
  categories: [
    { category: "dev", label: "Development", tools: [tool("github", true), tool("plane", false)] },
    { category: "chat", label: "Communication", tools: [tool("slack", true)] },
    { category: "mcp", label: "MCP", tools: [tool("linear", false)] },
  ] as IntegrationCatalog["categories"],
}

describe("catalogForThisApp", () => {
  it("webapp : le catalogue reste tel quel", () => {
    expect(catalogForThisApp(catalog, false)).toBe(catalog)
  })

  it("app desktop : GitHub et Slack masqués (PC-060), catégories vides retirées, comptes recalculés", () => {
    const c = catalogForThisApp(catalog, true)
    const keys = c.categories.flatMap((g) => g.tools.map((t) => t.key))
    expect(keys).toEqual(["plane", "linear"])
    expect(c.categories.map((g) => g.category)).toEqual(["dev", "mcp"])
    expect(c.total).toBe(2)
    expect(c.connected).toBe(0)
  })
})
