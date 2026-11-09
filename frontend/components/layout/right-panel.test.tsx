import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"

const nav = vi.hoisted(() => ({ pathname: "/acme/projects/3" }))
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useParams: () => ({ workspace: "acme" }),
  useRouter: () => ({ push: vi.fn() }),
}))
// Les deux cartes du travail ont leurs propres tests (work-rows.test.tsx).
vi.mock("@/components/layout/work-rows", () => ({ ChangesRow: () => null, MissionsRow: () => null }))

import { RightPanel } from "./right-panel"
import type { AiStatus } from "@/lib/api/ai-status-service"
import type { AssistantAnswer } from "@/lib/api/assistant-service"
import type { IntegrationCatalog } from "@/lib/api/integration-service"
import type { Issue } from "@/lib/api/issue-service"
import type { Project } from "@/lib/api/project-service"
import type { Workspace } from "@/lib/api/workspace-service"
import { useAiStatusStore } from "@/lib/store/ai-status-store"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useIntegrationStore } from "@/lib/store/integration-store"
import { useIssueStore } from "@/lib/store/issue-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useScreenStore } from "@/lib/store/screen-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { useWindowStore } from "@/lib/store/window-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

const STATUS: AiStatus = {
  configured: true, chatAvailable: true, chatModel: "qwen3:14b", fastModel: "qwen3:8b", embeddingsAvailable: true,
  embeddingModel: "nomic-embed-text", contextWindow: null, fastContextWindow: null,
}

const CATALOG: IntegrationCatalog = {
  total: 3, connected: 2,
  categories: [{
    category: "DEV", label: "Development",
    tools: (["notion", "linear", "figma"] as const).map((key, i) => ({
      key, name: key.charAt(0).toUpperCase() + key.slice(1), category: "DEV", authType: "MCP" as const, connected: i < 2,
      fields: [], capabilities: [], description: null, docsUrl: null, setupHint: null, websiteUrl: null, mcpSuggestedUrl: null,
    })),
  }],
}

const row = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) })

/** Une fenêtre de `width` pixels de large : les requêtes `min-width` y répondent. */
function widthOf(width: number) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0),
      media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }),
  })
}

/** La zone de droite (R122, R141) : des cartes repliées, chacune dit d'un regard ce qu'elle apporte ; ici l'environnement, le contexte, les connecteurs. */
describe("RightPanel", () => {
  const fetchConnectors = vi.fn().mockResolvedValue(true)
  const openSettings = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    widthOf(1440)
    nav.pathname = "/acme/projects/3"
    useWindowStore.setState({ rightOpen: true, rightDrawer: false, rows: {} })
    useWorkspaceStore.setState({ activeWorkspace: { name: "Acme", slug: "acme" } as Workspace })
    useProjectStore.setState({
      projects: [{ id: 3, name: "Website", identifier: "WEB", repoFullName: "acme/website" } as Project],
    })
    useAiStatusStore.setState({ status: STATUS })
    useCortexStore.setState({ conversations: [], conversationId: null, context: null, turns: [] })
    useScreenStore.setState({ openIssue: null })
    useIssueStore.setState({ issues: [], activeIssue: null })
    useIntegrationStore.setState({ connectors: null, fetchConnectors })
    useSettingsStore.setState({ openSettings })
  })

  // Sous `lg`, la zone de droite est un tiroir (« Le dessin », séance n°18), fermé tant qu'on ne l'ouvre pas.
  it("is a drawer under lg, closed until it is opened", () => {
    widthOf(800)
    useWindowStore.setState({ rightOpen: true, rightDrawer: false })
    const { rerender } = render(<RightPanel />)
    expect(screen.queryByRole("complementary")).toBeNull()
    expect(screen.queryByRole("dialog")).toBeNull()

    useWindowStore.setState({ rightDrawer: true })
    rerender(<RightPanel />)
    const drawer = screen.getByRole("dialog", { name: "Around the conversation" })
    expect(within(drawer).getByRole("button", { name: /^Environment/ })).toBeInTheDocument()

    fireEvent.keyDown(drawer, { key: "Escape" })
    expect(useWindowStore.getState().rightDrawer).toBe(false)
  })

  it("is not there when folded", () => {
    useWindowStore.setState({ rightOpen: false })
    render(<RightPanel />)
    expect(screen.queryByRole("complementary", { name: "Around the conversation" })).toBeNull()
  })

  it("folds its cards by default, each saying at a glance what it brings", () => {
    useIntegrationStore.setState({ connectors: { catalog: CATALOG, servers: [] } })
    render(<RightPanel />)

    const panel = screen.getByRole("complementary", { name: "Around the conversation" })
    expect(within(panel).getAllByRole("button", { expanded: false }).map((b) => b.textContent)).toEqual([
      "EnvironmentWebsite, on TaskForce", "ContextCortex sees the board of Website", "ConnectorsLinear and Notion",
    ])
    expect(fetchConnectors).toHaveBeenCalledWith("acme")
  })

  it("tells the environment: where it works at a glance, then what the glance does not say", () => {
    render(<RightPanel />)
    fireEvent.click(row("Environment"))

    const details = row("Environment").nextElementSibling as HTMLElement
    expect(details).toHaveTextContent("WorkspaceAcme")
    expect(details).toHaveTextContent("Repositoryacme/website")
    expect(details).toHaveTextContent("Modelqwen3:8b")
    expect(details).not.toHaveTextContent("Website,")
    expect(details).not.toHaveTextContent("TaskForce")
  })

  it("names the workspace at a glance without a project in view, and does not repeat it", () => {
    nav.pathname = "/acme"
    render(<RightPanel />)

    expect(row("Environment")).toHaveTextContent("Acme, on TaskForce")
    fireEvent.click(row("Environment"))
    expect(row("Environment").nextElementSibling).not.toHaveTextContent("Workspace")
  })

  it("has no detail to unfold when there is none", () => {
    nav.pathname = "/acme"
    useAiStatusStore.setState({ status: null })
    render(<RightPanel />)

    expect(screen.queryByRole("button", { name: /^Environment/ })).toBeNull()
    expect(screen.getByText("Acme, no model yet")).toBeInTheDocument()
  })

  it("says what Cortex sees at a glance, then the room its last answer took and what it read, in plain words", () => {
    useScreenStore.setState({ openIssue: { projectId: 3, issueId: 12 } })
    useIssueStore.setState({ issues: [{ id: 12, identifier: "WEB-12" } as Issue] })
    useCortexStore.setState({
      context: { tokens: 4096, window: 32_768 },
      turns: [{ id: "a", role: "assistant", answer: { read: { issues: [{ key: "WEB-12", comments: 2 }], boards: [], tools: [], notes: 2 } } as unknown as AssistantAnswer }],
    })
    render(<RightPanel />)

    expect(row("Context")).toHaveTextContent("Cortex sees WEB-12 on the board of Website")
    expect(row("Context")).toHaveTextContent("13%")
    fireEvent.click(row("Context"))
    expect(screen.getByText("Its last answer used 13% of what qwen3:8b can hold.")).toHaveAttribute("title", "4.1k tokens")
    expect(screen.getByText("It read 1 issue and 2 notes.")).toBeInTheDocument()
  })

  it("gives the size of the last request in words when the provider holds the window", () => {
    nav.pathname = "/acme"
    useCortexStore.setState({ context: { tokens: 3700, window: null }, turns: [] })
    render(<RightPanel />)

    expect(row("Context")).toHaveTextContent("Cortex sees your workspace")
    expect(row("Context")).not.toHaveTextContent("%")
    fireEvent.click(row("Context"))
    expect(screen.getByText("Its last answer read about 2,775 words.")).toBeInTheDocument()
  })

  it("lists the connectors, the ones to reconnect first, and leads to the settings", () => {
    useIntegrationStore.setState({
      connectors: { catalog: CATALOG, servers: [{ connectorKey: "notion", name: null, url: "", reachable: false, tools: [], error: "timeout" }] },
    })
    render(<RightPanel />)

    expect(row("Connectors")).toHaveTextContent("Notion needs reconnecting")
    fireEvent.click(row("Connectors"))
    const lines = screen.getAllByRole("button").filter((b) => /^(Linear|Notion)/.test(b.textContent ?? ""))
    expect(lines.map((b) => b.textContent)).toEqual(["NotionReconnect", "Linear"])
    fireEvent.click(lines[1])
    expect(openSettings).toHaveBeenCalledWith("integrations")
  })

  it("says when the connectors can't be read, and tries again", async () => {
    fetchConnectors.mockResolvedValueOnce(false)
    render(<RightPanel />)

    await waitFor(() => expect(row("Connectors")).toHaveTextContent("Couldn't read your connectors."))
    fireEvent.click(row("Connectors"))
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(fetchConnectors).toHaveBeenCalledTimes(2)
  })

  it("says how to connect a tool when none is connected", () => {
    useIntegrationStore.setState({ connectors: { catalog: { ...CATALOG, categories: [] }, servers: [] } })
    render(<RightPanel />)

    expect(row("Connectors")).toHaveTextContent("None yet")
    fireEvent.click(row("Connectors"))
    fireEvent.click(screen.getByRole("button", { name: "Connect your tools in Settings" }))
    expect(openSettings).toHaveBeenCalledWith("integrations")
  })
})
