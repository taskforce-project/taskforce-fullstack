import { describe, expect, it } from "vitest"

import type { ConnectorView, IntegrationCatalog, McpServerStatus } from "@/lib/api/integration-service"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { connectorLines, connectorsSummary } from "./connectors"

function tool(key: string, name: string, connected: boolean): ConnectorView {
  return {
    key, name, category: "DEV", authType: key === "github" ? "OAUTH2" : "MCP", connected, fields: [], capabilities: [],
    description: null, docsUrl: null, setupHint: null, websiteUrl: null, mcpSuggestedUrl: null,
  }
}

const server = (connectorKey: string, reachable: boolean): McpServerStatus => ({
  connectorKey, name: null, url: "https://mcp.example.com", reachable, tools: [], error: reachable ? null : "timeout",
})

/** « Connectors » (R122) : les connecteurs connectés, ceux à reconnecter d'abord. */
describe("connectorLines", () => {
  it("montre les connecteurs connectés, celui que TaskForce ne joint plus d'abord", () => {
    const catalog: IntegrationCatalog = {
      total: 4, connected: 3,
      categories: [
        { category: "DEV", label: "Development", tools: [tool("github", "GitHub", true), tool("linear", "Linear", true)] },
        { category: "DOCS", label: "Docs", tools: [tool("notion", "Notion", true), tool("figma", "Figma", false)] },
      ],
    }

    expect(connectorLines(catalog, [server("linear", true), server("notion", false)])).toEqual([
      { key: "notion", name: "Notion", reconnect: true },
      { key: "github", name: "GitHub", reconnect: false },
      { key: "linear", name: "Linear", reconnect: false },
    ])
  })

  it("ne montre rien sans connecteur connecté", () => {
    expect(connectorLines({ total: 1, connected: 0, categories: [{ category: "DEV", label: "Dev", tools: [tool("github", "GitHub", false)] }] }, []))
      .toEqual([])
  })
})

/** D'un regard (R141) : ce qui demande un geste d'abord, sinon ce qui est branché. */
describe("connectorsSummary", () => {
  const t = CONSTANTS_EN.rail.connectors
  const line = (name: string, reconnect = false) => ({ key: name, name, reconnect })

  it.each([
    [[], "None yet"],
    [[line("GitHub")], "GitHub"],
    [[line("GitHub"), line("Slack")], "GitHub and Slack"],
    [[line("GitHub"), line("Slack"), line("Notion"), line("Figma")], "GitHub, Slack and 2 more"],
    [[line("Notion", true), line("GitHub")], "Notion needs reconnecting"],
    [[line("Notion", true), line("Slack", true), line("GitHub")], "2 need reconnecting"],
  ])("%j : %s", (lines, sentence) => {
    expect(connectorsSummary(lines, t)).toBe(sentence)
  })
})
