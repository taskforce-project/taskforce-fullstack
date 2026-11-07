import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

const nav = vi.hoisted(() => ({ pathname: "/acme/projects/3" }))
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useParams: () => ({ workspace: "acme" }),
  useRouter: () => ({ push: vi.fn() }),
}))
// Les trois lignes du travail ont leurs propres tests (work-rows.test.tsx).
vi.mock("@/components/layout/work-rows", () => ({ ResultsRow: () => null, ChangesRow: () => null, MissionsRow: () => null }))

import { RightPanel } from "./right-panel"
import type { AiStatus } from "@/lib/api/ai-status-service"
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

/** La zone de droite (R122) : six lignes repliées, chacune avec son nombre ; ici l'environnement, le contexte, les connecteurs. */
describe("RightPanel", () => {
  const fetchConnectors = vi.fn().mockResolvedValue(true)
  const openSettings = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    nav.pathname = "/acme/projects/3"
    useWindowStore.setState({ rightOpen: true, rows: {} })
    useWorkspaceStore.setState({ activeWorkspace: { name: "Acme", slug: "acme" } as Workspace })
    useProjectStore.setState({
      projects: [{ id: 3, name: "Website", identifier: "WEB", repoFullName: "acme/website" } as Project],
    })
    useAiStatusStore.setState({ status: STATUS })
    useCortexStore.setState({ conversations: [], conversationId: null, context: null })
    useScreenStore.setState({ openIssue: null })
    useIssueStore.setState({ issues: [], activeIssue: null })
    useIntegrationStore.setState({ connectors: null, fetchConnectors })
    useSettingsStore.setState({ openSettings })
  })

  it("is not there when folded", () => {
    useWindowStore.setState({ rightOpen: false })
    render(<RightPanel />)
    expect(screen.queryByRole("complementary", { name: "Around the conversation" })).toBeNull()
  })

  it("folds its rows by default, each with its number", () => {
    render(<RightPanel />)

    const panel = screen.getByRole("complementary", { name: "Around the conversation" })
    expect(within(panel).getAllByRole("button", { expanded: false }).map((b) => b.textContent)).toEqual([
      "EnvironmentTaskForce", "Context", "Connectors",
    ])
    expect(fetchConnectors).toHaveBeenCalledWith("acme")
  })

  it("tells the environment: the workspace, the project in view, its repository, where the model runs", () => {
    render(<RightPanel />)
    fireEvent.click(row("Environment"))

    const details = screen.getByRole("button", { name: /^Environment/ }).nextElementSibling as HTMLElement
    expect(details).toHaveTextContent("WorkspaceAcme")
    expect(details).toHaveTextContent("ProjectWebsite WEB")
    expect(details).toHaveTextContent("Repositoryacme/website")
    expect(details).toHaveTextContent("Modelqwen3:8b, on TaskForce")
  })

  it("says what Cortex sees and the room its last answer took, in one sentence", () => {
    useScreenStore.setState({ openIssue: { projectId: 3, issueId: 12 } })
    useIssueStore.setState({ issues: [{ id: 12, identifier: "WEB-12" } as Issue] })
    useCortexStore.setState({ context: { tokens: 4096, window: 32_768 } })
    render(<RightPanel />)

    expect(row("Context")).toHaveTextContent("13%")
    fireEvent.click(row("Context"))
    expect(screen.getByText(
      "Cortex sees WEB-12 on the board of Website, and its last answer took 13% of qwen3:8b's window (4.1k tokens).",
    )).toBeInTheDocument()
  })

  it("gives the size of the last request when the provider holds the window", () => {
    nav.pathname = "/acme"
    useCortexStore.setState({ context: { tokens: 3700, window: null } })
    render(<RightPanel />)

    expect(row("Context")).toHaveTextContent("3.7k")
    fireEvent.click(row("Context"))
    expect(screen.getByText("Cortex sees no board, only your workspace's knowledge, and its last answer read 3.7k tokens."))
      .toBeInTheDocument()
  })

  it("lists the connectors, the ones to reconnect first, and leads to the settings", () => {
    useIntegrationStore.setState({
      connectors: { catalog: CATALOG, servers: [{ connectorKey: "notion", name: null, url: "", reachable: false, tools: [], error: "timeout" }] },
    })
    render(<RightPanel />)

    expect(row("Connectors")).toHaveTextContent("1 to reconnect")
    fireEvent.click(row("Connectors"))
    const lines = screen.getAllByRole("button").filter((b) => /^(Linear|Notion)/.test(b.textContent ?? ""))
    expect(lines.map((b) => b.textContent)).toEqual(["NotionTo reconnect", "LinearConnected"])
    fireEvent.click(lines[1])
    expect(openSettings).toHaveBeenCalledWith("integrations")
  })

  it("says how to connect a tool when none is connected", () => {
    useIntegrationStore.setState({ connectors: { catalog: { ...CATALOG, categories: [] }, servers: [] } })
    render(<RightPanel />)

    expect(row("Connectors")).toHaveTextContent("0")
    fireEvent.click(row("Connectors"))
    fireEvent.click(screen.getByRole("button", { name: "No connector yet. Connect your tools in Settings." }))
    expect(openSettings).toHaveBeenCalledWith("integrations")
  })
})
