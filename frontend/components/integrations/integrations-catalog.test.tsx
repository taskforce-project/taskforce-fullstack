import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { AxiosError, AxiosHeaders } from "axios"

import type { ConnectorView, IntegrationCatalog } from "@/lib/api/integration-service"
import { connectMcpServer, getIntegrationCatalog } from "@/lib/api/integration-service"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { useConnectorStore } from "@/lib/store/connector-store"
import { useUserStore } from "@/lib/store/user-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { IntegrationsCatalog } from "./integrations-catalog"

vi.mock("@/lib/desktop", () => ({ IS_DESKTOP: false }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/components/integrations/mcp-action-console", () => ({ McpActionConsole: () => <div>console</div> }))
vi.mock("@/components/desktop/desktop-github-connect", () => ({ DesktopGitHubConnect: () => null }))
vi.mock("@/lib/api/integration-service", async (actual) => ({
  ...(await actual<typeof import("@/lib/api/integration-service")>()),
  getIntegrationCatalog: vi.fn(),
  getMcpServers: vi.fn().mockResolvedValue([]),
  getMcpServerTools: vi.fn().mockResolvedValue([]),
  connectMcpServer: vi.fn(),
}))

/** Une réponse d'erreur de l'API avec sa raison, telle qu'axios la rend. */
function refused(error: string, message: string): AxiosError {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, null,
    { status: 400, statusText: "", headers: {}, config, data: { status: 400, error, message } })
}

const c = CONSTANTS_EN.connect
const t = CONSTANTS_EN.integrations

function preset(key: string, name: string, patch: Partial<ConnectorView> = {}): ConnectorView {
  return {
    key, name, category: "TICKETS_PROJECTS", authType: "MCP", connected: false, fields: [], capabilities: ["mcp"],
    description: `${name} work`, docsUrl: null, setupHint: null, websiteUrl: null, mcpSuggestedUrl: `https://mcp.${key}.test/mcp`,
    state: "NOT_CONNECTED", accountLabel: null, scope: null, connection: "self-registration", admin: null, apiKey: null,
    companyApp: false, writeChoice: false, blocked: null, tried: true, ...patch,
  }
}

const slack: ConnectorView = {
  key: "slack", name: "Slack", category: "CHAT_MAIL", authType: "OAUTH2", connected: false, fields: [],
  capabilities: ["observe", "act"], description: "Posts issue notifications to your channels.", docsUrl: null,
  setupHint: "One-click connect.", websiteUrl: null, mcpSuggestedUrl: null, state: "NOT_CONNECTED",
  live: preset("slack-mcp", "Slack", { category: "CHAT_MAIL", connection: "company-app", state: "NEEDS_SETUP",
    admin: { text: "Create an internal Slack app.", link: null, required: true } }),
}

function catalog(...tools: ConnectorView[]): IntegrationCatalog {
  return { total: tools.length, connected: tools.filter((x) => x.connected).length, categories: [
    { category: "TICKETS_PROJECTS", label: "Tickets and projects", tools: tools.filter((x) => x.category === "TICKETS_PROJECTS") },
    { category: "CHAT_MAIL", label: "Chat, mail and meetings", tools: tools.filter((x) => x.category === "CHAT_MAIL") },
  ].filter((g) => g.tools.length > 0) }
}

const connect = vi.fn()
const disconnect = vi.fn()
const servers = vi.fn()

/** Le dialogue de connexion, par son titre. */
const dialog = () => screen.getByRole("dialog")

describe("IntegrationsCatalog (revue des écrans de J2, R160)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWorkspaceStore.setState({ members: [{ userId: 7, role: "OWNER" }] as never, fetchMembers: vi.fn() as never })
    useUserStore.setState({ user: { id: 7 } as never })
    useConnectorStore.setState({ outcomes: {}, busy: null, waiting: null, error: null, failure: null, connect, disconnect, servers })
    servers.mockResolvedValue([])
  })

  it("« Connect » on a card opens the connection at once; « Learn more » opens the detail page", async () => {
    vi.mocked(getIntegrationCatalog).mockResolvedValue(catalog(preset("linear", "Linear")))
    render(<IntegrationsCatalog slug="acme" />)

    fireEvent.click(await screen.findByRole("button", { name: c.connect }))
    expect(within(dialog()).getByText(c.intro.replace("{name}", "Linear"))).toBeInTheDocument()
    expect(within(dialog()).getByRole("button", { name: c.connect })).toBeInTheDocument()
    fireEvent.keyDown(dialog(), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    fireEvent.click(screen.getByRole("button", { name: "Learn more about Linear" }))
    expect(screen.getByText("Connection")).toBeInTheDocument()
    expect(screen.getByText(/you sign in to Linear in your browser, then come back connected/)).toBeInTheDocument()
    // La ligne de Cortex, sans « MCP: » (R160).
    expect(screen.getByText(t.capabilities.mcp.text)).toBeInTheDocument()
    expect(screen.queryByText(/MCP:|OAuth|custom header/)).toBeNull()
  })

  it("the dialog reads the tool again after connecting and after disconnecting", async () => {
    vi.mocked(getIntegrationCatalog)
      .mockResolvedValueOnce(catalog(preset("linear", "Linear")))
      .mockResolvedValueOnce(catalog(preset("linear", "Linear", { connected: true, state: "CONNECTED", scope: "PERSONAL",
        accountLabel: "ada@acme.test" })))
      .mockResolvedValueOnce(catalog(preset("linear", "Linear")))
    connect.mockResolvedValue({ next: "connected", authorizeUrl: null, message: null })
    disconnect.mockResolvedValue({ revoked: true, revocable: true, servers: [] })
    render(<IntegrationsCatalog slug="acme" />)

    fireEvent.click(await screen.findByRole("button", { name: c.connect }))
    fireEvent.click(within(dialog()).getByRole("button", { name: c.connect }))
    expect(await within(dialog()).findByText(c.connectedAs.replace("{account}", "ada@acme.test"))).toBeInTheDocument()

    fireEvent.click(within(dialog()).getByRole("button", { name: c.disconnect }))
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Linear" }))
    expect(await within(dialog()).findByText(c.intro.replace("{name}", "Linear"))).toBeInTheDocument()
    expect(within(dialog()).queryByText(c.connectedAs.replace("{account}", "ada@acme.test"))).toBeNull()
  })

  it("Slack shows once; its second access is offered inside, named by what it adds, and the admin sets it up", async () => {
    vi.mocked(getIntegrationCatalog).mockResolvedValue(catalog(slack))
    render(<IntegrationsCatalog slug="acme" />)

    expect(await screen.findAllByRole("heading", { name: "Slack" })).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: c.connect }))

    expect(within(dialog()).getByText("Posts issue notifications to your channels.")).toBeInTheDocument()
    expect(within(dialog()).getByText(c.liveTitle.replace("{name}", "Slack"))).toBeInTheDocument()
    fireEvent.click(within(dialog()).getByRole("button", { name: t.setUp }))
    // Le propriétaire fait l'étape de l'administrateur : l'application de l'entreprise, pas une attente.
    expect(within(dialog()).getByText(c.companyAppTitle)).toBeInTheDocument()
    expect(within(dialog()).queryByText(c.waitingForAdmin)).toBeNull()
    fireEvent.click(within(dialog()).getByRole("button", { name: c.liveBack.replace("{name}", "Slack") }))
    expect(within(dialog()).getByText(c.liveTitle.replace("{name}", "Slack"))).toBeInTheDocument()
  })

  it("a server on the local network asks for the person's approval, from its name or from the server's reason", async () => {
    vi.mocked(getIntegrationCatalog).mockResolvedValue(catalog(preset("linear", "Linear")))
    vi.mocked(connectMcpServer).mockRejectedValue(refused("CONNECT_LOCAL_NEEDS_APPROVAL", "This server runs on your local network."))
    render(<IntegrationsCatalog slug="acme" />)

    fireEvent.click(await screen.findByRole("button", { name: /Connect an MCP server/ }))
    fireEvent.change(within(dialog()).getByPlaceholderText("Team docs"), { target: { value: "Printer" } })
    const address = within(dialog()).getByPlaceholderText("https://.../mcp")
    fireEvent.change(address, { target: { value: "https://printer.local/mcp" } })
    expect(within(dialog()).getByRole("checkbox", { name: new RegExp(c.localConfirm) })).toBeInTheDocument()

    // Un nom que le motif ne connaît pas : le serveur dit qu'il est local, la case apparaît avec la phrase.
    fireEvent.change(address, { target: { value: "https://mcp.corp.lan/mcp" } })
    expect(within(dialog()).queryByRole("checkbox", { name: new RegExp(c.localConfirm) })).toBeNull()
    fireEvent.click(within(dialog()).getByRole("button", { name: "Use a token instead" }))
    fireEvent.click(within(dialog()).getByRole("button", { name: "Connect" }))
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(c.failures.CONNECT_LOCAL_NEEDS_APPROVAL)
    expect(within(dialog()).getByRole("checkbox", { name: new RegExp(c.localConfirm) })).toBeInTheDocument()
  })

  it("an owner or admin reads « Set it up » on a tool that needs the company's app, never a wait", async () => {
    vi.mocked(getIntegrationCatalog).mockResolvedValue(catalog(preset("zoom", "Zoom", { connection: "company-app", state: "NEEDS_SETUP" })))
    render(<IntegrationsCatalog slug="acme" />)

    expect(await screen.findByRole("button", { name: t.setUp })).toBeInTheDocument()
    expect(screen.getByText(c.pathAdminFirst)).toBeInTheDocument()
    expect(screen.queryByText(c.waitingForAdmin)).toBeNull()
  })
})
