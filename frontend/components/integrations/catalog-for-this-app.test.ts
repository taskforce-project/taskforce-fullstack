import { describe, expect, it } from "vitest"

import type { ConnectorView, IntegrationCatalog } from "@/lib/api/integration-service"
import { CONSTANTS_EN } from "@/lib/constants_en"
import {
  cardAction, cardPathLabel, catalogForThisApp, connectedLabel, connectionOf, nativeConnects, filterCatalog, folds, FOLDED_COUNT, isConnected, shownAccess,
} from "./integrations-catalog"

const t = CONSTANTS_EN.integrations
const c = CONSTANTS_EN.connect

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
  // Les mots de la personne, jamais « OAuth », « API key » ni « MCP » (R160).
  it.each([
    ["github", "OAUTH2", false, "One click", true],
    ["github", "OAUTH2", true, "GitHub CLI", true],
    ["slack", "OAUTH2", false, "One click", true],
    ["slack", "OAUTH2", true, "Web app only", false],
    ["plane", "API_KEY", true, "Key", true],
    ["custom-docs", "MCP", true, "Server address", true],
  ] as const)("%s (%s), desktop %s : %s, connectable %s", (key, authType, desktop, label, canConnect) => {
    expect(connectionOf(tool(key, false, authType), t, desktop, c)).toMatchObject({ label, canConnect })
  })

  it("dit où vit la connexion GitHub de l'app desktop", () => {
    expect(connectionOf(tool("github", false), t, true, c).help).toBe(t.githubCliHelp)
  })

  it("une phrase simple par chemin, qui ne contredit pas le chemin (R160)", () => {
    expect(connectionOf(tool("github", false), t, false, c).help).toBe("you sign in to github in your browser, then come back connected.")
    expect(connectionOf(tool("plane", false, "API_KEY"), t, false, c).help).toContain("paste it here")
    const zoom = { ...tool("zoom", false, "MCP"), name: "Zoom", connection: "company-app" } as ConnectorView
    expect(connectionOf(zoom, t, false, c)).toEqual({ label: "Admin first",
      help: "an owner or admin of this workspace sets up Zoom once, then everyone connects with their own account.", canConnect: true })
  })

  it("un outil que l'éditeur ferme encore ne se connecte pas", () => {
    const figma = { ...tool("figma", false, "MCP"), connection: "our-app", blocked: "Waitlist." } as ConnectorView
    expect(connectionOf(figma, t, false, c)).toMatchObject({ label: "One click", canConnect: false })
  })
})

describe("une carte par outil, et « Connect » depuis la carte (R160)", () => {
  const live = (patch: Partial<ConnectorView> = {}) =>
    ({ ...tool("slack-mcp", false, "MCP"), connection: "company-app", state: "NOT_CONNECTED", ...patch }) as ConnectorView
  const slack = (patch: Partial<ConnectorView> = {}) => ({ ...tool("slack", false), live: live(), ...patch }) as ConnectorView

  it("une carte est branchée par sa native ou par son second accès", () => {
    expect(isConnected(slack())).toBe(false)
    expect(isConnected(slack({ connected: true }))).toBe(true)
    expect(isConnected(slack({ live: live({ connected: true, state: "CONNECTED" }) }))).toBe(true)
    const both = { total: 1, connected: 1, categories: [{ category: "chat", label: "Chat", tools: [slack({ live: live({ connected: true }) })] }] } as IntegrationCatalog
    expect(filterCatalog(both, { query: "", category: "all", status: "connected" })).toHaveLength(1)
    expect(catalogForThisApp(both, t, true, null).connected).toBe(1)
  })

  it.each([
    ["à connecter", tool("linear", false, "MCP"), "Connect"],
    ["branché", tool("linear", true, "MCP"), "Manage"],
    ["l'étape de l'administrateur lui revient", { ...tool("zoom", false, "MCP"), state: "NEEDS_SETUP" }, "Set it up"],
    ["à reconnecter", { ...tool("notion", false, "MCP"), state: "NEEDS_RECONNECT" }, "Reconnect"],
    ["fermé par l'éditeur", { ...tool("figma", false, "MCP"), connection: "our-app", blocked: "Waitlist." }, null],
  ] as [string, ConnectorView, string | null][])("%s : %s", (_label, item, expected) => {
    expect(cardAction(item, t, false, c)).toBe(expected)
  })

  it("la native pas branchée : la carte montre le second accès dès qu'il a une connexion, et le nomme (R160, R161)", () => {
    expect(shownAccess(slack()).key).toBe("slack")
    const stale = slack({ live: live({ state: "NEEDS_RECONNECT", scope: "WORKSPACE" }) })
    expect(shownAccess(stale).key).toBe("slack-mcp")
    expect(cardAction(stale, t, false, c)).toBe("Reconnect")
    // La native branchée reste ce que la carte montre.
    expect(shownAccess(slack({ connected: true, live: live({ state: "NEEDS_RECONNECT", scope: "PERSONAL" }) })).key).toBe("slack")
    expect(connectedLabel(slack({ live: live({ connected: true, state: "CONNECTED", scope: "PERSONAL" }) }), c)).toBe("Cortex connected")
    expect(connectedLabel(slack({ connected: true, live: live({ connected: true }) }), c)).toBe("Connected")
    expect(connectedLabel(tool("linear", true, "MCP"), c)).toBe("Connected")
  })

  it("Slack dans l'app desktop : la carte dit le chemin de Cortex, que « Connect » ouvre, pas « Web app only » (R160)", () => {
    expect(cardPathLabel(slack(), t, true, c)).toBe("Admin first")
    expect(cardPathLabel(tool("slack", false), t, true, c)).toBe("Web app only")
    expect(cardPathLabel(slack(), t, false, c)).toBe("One click")
  })

  it("un membre : la native n'est pas à lui, la carte ouvre son propre accès ; une attente montre quoi envoyer (R161)", () => {
    expect(nativeConnects(tool("slack", false), t, false, c, false)).toBe(false)
    expect(nativeConnects(tool("slack", false), t, false, c, true)).toBe(true)
    expect(nativeConnects(tool("linear", false, "MCP"), t, false, c, false)).toBe(true)
    expect(cardAction(slack(), t, false, c, false)).toBe("Connect")
    expect(cardAction(tool("slack", false), t, false, c, false)).toBeNull()
    expect(cardPathLabel(slack(), t, false, c, false)).toBe("Admin first")
    expect(cardAction({ ...tool("zoom", false, "MCP"), state: "WAITING_FOR_ADMIN" } as ConnectorView, t, false, c, false)).toBe("See what to send")
  })

  it("Slack dans l'app desktop : la native ne se connecte pas ici, son second accès oui", () => {
    expect(cardAction(tool("slack", false), t, true, c)).toBeNull()
    expect(cardAction(slack(), t, true, c)).toBe("Connect")
  })
})

describe("filterCatalog et folds (plus de cent outils, R153)", () => {
  const all = { query: "", category: "all", status: "all" } as const

  it("sans filtre : chaque catégorie, chaque outil", () => {
    expect(filterCatalog(catalog, all).map((g) => g.tools.length)).toEqual([2, 1, 1])
  })

  it("la recherche lit le nom, la description et l'intitulé de la catégorie", () => {
    expect(filterCatalog(catalog, { ...all, query: "SLACK" }).flatMap((g) => g.tools.map((x) => x.key))).toEqual(["slack"])
    expect(filterCatalog(catalog, { ...all, query: "plane on the web" }).flatMap((g) => g.tools.map((x) => x.key))).toEqual(["plane"])
    expect(filterCatalog(catalog, { ...all, query: "development" }).flatMap((g) => g.tools.map((x) => x.key)))
      .toEqual(["github", "plane"])
  })

  it("la recherche lit aussi la description du second accès (R160)", () => {
    const slack = { ...tool("slack", false), live: { ...tool("slack-mcp", false, "MCP"), description: "Search and read your channels" } } as ConnectorView
    const chat = { total: 1, connected: 0, categories: [{ category: "chat", label: "Chat", tools: [slack] }] } as IntegrationCatalog
    expect(filterCatalog(chat, { ...all, query: "read your channels" }).flatMap((g) => g.tools.map((x) => x.key))).toEqual(["slack"])
  })

  it("une catégorie, un état : les catégories vides disparaissent", () => {
    expect(filterCatalog(catalog, { ...all, category: "chat" }).map((g) => g.category)).toEqual(["chat"])
    expect(filterCatalog(catalog, { ...all, status: "connected" }).flatMap((g) => g.tools.map((x) => x.key)))
      .toEqual(["github", "slack"])
    expect(filterCatalog(catalog, { ...all, status: "disconnected" }).map((g) => g.category)).toEqual(["dev", "mcp"])
    expect(filterCatalog(catalog, { ...all, query: "nothing like this" })).toEqual([])
  })

  it("dans une catégorie, ce qui se connecte vient avant ce que l'éditeur ferme encore", () => {
    const closed = { ...tool("figma", false, "MCP"), blocked: "Waitlist." } as ConnectorView
    const design = { total: 3, connected: 0, categories: [
      { category: "DESIGN", label: "Design", tools: [closed, tool("miro", false, "MCP"), tool("lucid", false, "MCP")] },
    ] } as IntegrationCatalog
    expect(filterCatalog(design, all)[0].tools.map((x) => x.key)).toEqual(["miro", "lucid", "figma"])
  })

  it("une catégorie se replie seulement sans recherche ni filtre, au-delà de ses premiers outils", () => {
    expect(folds(all, FOLDED_COUNT + 1)).toBe(true)
    expect(folds(all, FOLDED_COUNT)).toBe(false)
    expect(folds({ ...all, query: "data" }, 40)).toBe(false)
    expect(folds({ ...all, category: "DATA" }, 40)).toBe(false)
    expect(folds({ ...all, status: "connected" }, 40)).toBe(false)
  })
})
