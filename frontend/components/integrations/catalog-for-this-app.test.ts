import { describe, expect, it } from "vitest"

import type { ConnectorView, IntegrationCatalog } from "@/lib/api/integration-service"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { catalogForThisApp, connectionOf } from "./integrations-catalog"

const t = CONSTANTS_EN.integrations

const tool = (key: string, connected: boolean, authType: ConnectorView["authType"] = "OAUTH2") =>
  ({ key, name: key, connected, authType, description: `${key} on the web`, setupHint: "hint" }) as unknown as ConnectorView

const catalog: IntegrationCatalog = {
  total: 4,
  connected: 2,
  categories: [
    { category: "dev", label: "Development", tools: [tool("github", true), tool("plane", false, "API_KEY")] },
    { category: "chat", label: "Communication", tools: [tool("slack", true)] },
    { category: "mcp", label: "MCP", tools: [tool("linear", false, "MCP")] },
  ] as IntegrationCatalog["categories"],
}

const tools = (c: IntegrationCatalog) => c.categories.flatMap((g) => g.tools)
const byKey = (c: IntegrationCatalog, key: string) => tools(c).find((x) => x.key === key)

describe("catalogForThisApp", () => {
  it("webapp : le catalogue reste tel quel", () => {
    expect(catalogForThisApp(catalog, t, false)).toBe(catalog)
  })

  it("app desktop : GitHub, Slack et Plane restent à côté des préréglages essayés (rejeu de la 1.8.0)", () => {
    const c = catalogForThisApp(catalog, t, true, { installed: true, signedIn: true, login: "ada" })

    expect(tools(c).map((x) => x.key)).toEqual(["github", "plane", "slack", "linear"])
    expect(c.categories.map((g) => g.category)).toEqual(["dev", "chat", "mcp"])
    expect(c.total).toBe(4)
  })

  it.each([
    ["signed in with GitHub CLI", { installed: true, signedIn: true, login: "ada" }, true],
    ["GitHub CLI installed, nobody signed in", { installed: true, signedIn: false, login: null }, false],
    ["GitHub CLI missing", { installed: false, signedIn: false, login: null }, false],
    ["not read yet", null, false],
  ])("app desktop : GitHub connecté selon le GitHub CLI de la personne, %s", (_label, github, connected) => {
    // Le serveur dit GitHub connecté (OAuth de l'espace) : sur l'ordinateur, seul le GitHub CLI compte.
    const c = catalogForThisApp(catalog, t, true, github)

    expect(byKey(c, "github")?.connected).toBe(connected)
    expect(byKey(c, "github")?.description).toBe(t.desktopGitHubLine)
    expect(c.connected).toBe((connected ? 1 : 0) + 1) // et Slack, connecté pour l'espace
  })

  it("app desktop : Slack garde l'état que le serveur lui connaît, et dit qu'il ne se connecte pas ici", () => {
    const c = catalogForThisApp(catalog, t, true, null)

    expect(byKey(c, "slack")).toMatchObject({ connected: true, description: t.desktopSlackLine, setupHint: null })
    // Plane et les préréglages ne changent pas.
    expect(byKey(c, "plane")).toEqual(tool("plane", false, "API_KEY"))
    expect(byKey(c, "linear")).toEqual(tool("linear", false, "MCP"))
  })
})

describe("connectionOf", () => {
  it.each([
    ["github", "OAUTH2", false, "OAuth", true],
    ["github", "OAUTH2", true, "GitHub CLI", true],
    ["slack", "OAUTH2", false, "OAuth", true],
    ["slack", "OAUTH2", true, "Web app only", false],
    ["plane", "API_KEY", true, "API key", true],
    ["linear", "MCP", true, "MCP", true],
  ] as const)("%s (%s), desktop %s : %s, connectable %s", (key, authType, desktop, label, canConnect) => {
    expect(connectionOf(tool(key, false, authType), t, desktop)).toMatchObject({ label, canConnect })
  })

  it("dit où vit la connexion GitHub de l'app desktop", () => {
    expect(connectionOf(tool("github", false), t, true).help).toBe(t.githubCliHelp)
  })
})
