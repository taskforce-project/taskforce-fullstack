import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { toast } from "sonner"

import type { ConnectorView } from "@/lib/api/integration-service"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { useConnectorStore } from "@/lib/store/connector-store"
import { ConnectPanel, pathLabel, pathSentence } from "./connect-panel"

const desktop = vi.hoisted(() => ({ value: false }))
vi.mock("@/lib/desktop", () => ({ get IS_DESKTOP() { return desktop.value } }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/components/integrations/mcp-action-console", () => ({ McpActionConsole: () => <div>console</div> }))
vi.mock("@/lib/api/integration-service", () => ({
  getMcpServerTools: vi.fn().mockResolvedValue([
    { name: "notion-search", description: "", inputSchema: null, readOnly: true },
    { name: "notion-create-pages", description: "", inputSchema: null, readOnly: false },
  ]),
}))

const t = CONSTANTS_EN.connect

function notion(overrides: Partial<ConnectorView> = {}): ConnectorView {
  return {
    key: "notion", name: "Notion", category: "KNOWLEDGE", authType: "MCP", connected: false, fields: [],
    capabilities: ["mcp"], description: "Docs", docsUrl: null, setupHint: null, websiteUrl: null,
    mcpSuggestedUrl: "https://mcp.notion.com/mcp", state: "NOT_CONNECTED", accountLabel: null, scope: null,
    connection: "self-registration", admin: null, apiKey: null, companyApp: false, writeChoice: false, blocked: null,
    tried: false, ...overrides,
  }
}

const connect = vi.fn()
const waitForConnection = vi.fn()
const saveCompanyApp = vi.fn()
const approveTools = vi.fn()
const disconnect = vi.fn()
const servers = vi.fn()
const onChanged = vi.fn()

const show = (tool: ConnectorView, manager = false) =>
  render(<ConnectPanel slug="acme" tool={tool} manager={manager} onChanged={onChanged} />)

describe("ConnectPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    desktop.value = false
    useConnectorStore.setState({
      outcomes: {}, busy: null, waiting: null, error: null, failure: null,
      connect, waitForConnection, saveCompanyApp, approveTools, disconnect, servers,
    })
    servers.mockResolvedValue([])
  })

  it("says what the connection gives, and connects in one click (read only, her own)", async () => {
    connect.mockResolvedValue({ next: "connected", authorizeUrl: null, message: null })
    show(notion())

    expect(screen.getByText(t.intro.replace("{name}", "Notion"))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: t.connect }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(connect).toHaveBeenCalledWith("acme", "notion", { shared: false, allowWrites: false })
    expect(toast.success).toHaveBeenCalledWith(t.returnedConnected.replace("{name}", "Notion"))
  })

  it("Cortex's own access says that Cortex is connected, not the tool (R161)", async () => {
    connect.mockResolvedValue({ next: "connected", authorizeUrl: null, message: null })
    render(<ConnectPanel slug="acme" tool={notion({ key: "slack-mcp", name: "Slack" })} manager={false} onChanged={onChanged} live />)
    fireEvent.click(screen.getByRole("button", { name: t.connect }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(t.liveReturnedConnected.replace("{name}", "Slack")))
  })

  it("on the web, sends the page to the vendor's sign-in", async () => {
    const location = { href: "http://app.test/acme" }
    Object.defineProperty(window, "location", { value: location, configurable: true, writable: true })
    connect.mockResolvedValue({ next: "browser", authorizeUrl: "https://vendor.test/authorize", message: null })
    show(notion({ writeChoice: true }), true)

    fireEvent.click(screen.getByLabelText(new RegExp(t.allowChanges)))
    fireEvent.click(screen.getByLabelText(new RegExp(t.shareWithWorkspace)))
    fireEvent.click(screen.getByRole("button", { name: t.connect }))

    await waitFor(() => expect(location.href).toBe("https://vendor.test/authorize"))
    expect(connect).toHaveBeenCalledWith("acme", "notion", { shared: true, allowWrites: true })
  })

  it("in the desktop app, opens the system browser and waits for the return", async () => {
    desktop.value = true
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    connect.mockResolvedValue({ next: "browser", authorizeUrl: "https://vendor.test/authorize", message: null })
    waitForConnection.mockResolvedValue(true)
    show(notion())

    fireEvent.click(screen.getByRole("button", { name: t.connect }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(open).toHaveBeenCalledWith("https://vendor.test/authorize", "_blank", "noopener")
    expect(waitForConnection).toHaveBeenCalledWith("acme", "notion")
  })

  it("while waiting for the browser, says so and lets the person cancel", () => {
    const stopWaiting = vi.fn()
    useConnectorStore.setState({ waiting: "notion", stopWaiting })
    show(notion())

    expect(screen.getByText(t.browserTitle)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: t.cancel }))
    expect(stopWaiting).toHaveBeenCalled()
  })

  it("a failure stays in the panel: what happened and what to do, then where it stopped, then the server's words (R160)", async () => {
    const raw = "OAuth DCR https://auth.notion.test/register : HTTP 400 (invalid_redirect_uri)"
    connect.mockImplementation(async () => {
      useConnectorStore.setState({ failure: { key: "notion", kind: "CONNECT_REGISTRATION_REFUSED", raw } })
      return null
    })
    show(notion())

    fireEvent.click(screen.getByRole("button", { name: t.connect }))

    const said = await screen.findByRole("alert")
    expect(said).toHaveTextContent(t.failures.CONNECT_REGISTRATION_REFUSED.replaceAll("{name}", "Notion"))
    expect(toast.error).not.toHaveBeenCalled()
    // Ni code, ni adresse, ni erreur OAuth au premier regard ; « Try again » vient après la cause.
    expect(screen.queryByText(/invalid_redirect_uri|auth\.notion\.test/)).toBeNull()
    expect(screen.getByRole("button", { name: t.tryAgain })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: t.failureDetails }))
    expect(screen.getByText("Where it stopped: registering TaskForce with Notion.")).toBeTruthy()
    expect(screen.queryByText(raw)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: t.failureRaw }))
    expect(screen.getByText(raw)).toBeTruthy()

    // Un autre outil ne montre pas cet échec.
    useConnectorStore.setState({ failure: { key: "linear", kind: "unknown", raw: null } })
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
  })

  it("a failure offers a key only when the tool has one, and then the panel has its button (R161)", async () => {
    connect.mockImplementation(async () => {
      useConnectorStore.setState({ failure: { key: "stripe", kind: "CONNECT_REGISTRATION_REFUSED", raw: null } })
      return null
    })
    const view = show(notion({ key: "stripe", name: "Stripe", apiKey: { hint: "Create a restricted key.", link: null } }))
    fireEvent.click(screen.getByRole("button", { name: t.connect }))
    expect(await screen.findByRole("alert")).toHaveTextContent(t.failuresWithKey.CONNECT_REGISTRATION_REFUSED.replaceAll("{name}", "Stripe"))
    fireEvent.click(screen.getByRole("button", { name: t.useKeyInstead }))
    expect(screen.getByLabelText(t.keyLabel)).toBeTruthy()
    view.unmount()

    useConnectorStore.setState({ failure: { key: "notion", kind: "CONNECT_REGISTRATION_REFUSED", raw: null } })
    show(notion())
    expect(screen.getByRole("alert")).not.toHaveTextContent(/key/i)
    expect(screen.queryByRole("button", { name: t.useKeyInstead })).toBeNull()
  })

  it("an owner or admin sets up a tool that needs the company's app: no wait on his own step (R160)", () => {
    const slack = notion({ key: "slack-mcp", name: "Slack", connection: "company-app", state: "NEEDS_SETUP",
      admin: { text: "Create an internal app.", link: null, required: true } })
    const view = show(slack, true)
    expect(screen.getByText(t.companyAppTitle)).toBeTruthy()
    expect(screen.queryByText(t.waitingForAdmin)).toBeNull()
    view.unmount()

    // NEEDS_SETUP suffit, même avant que la liste des membres ne dise le rôle de la personne.
    const early = show(slack, false)
    expect(screen.getByText(t.companyAppTitle)).toBeTruthy()
    early.unmount()

    show({ ...slack, state: "WAITING_FOR_ADMIN" }, false)
    expect(screen.getByText(t.waitingForAdmin)).toBeTruthy()
    expect(screen.queryByText(t.companyAppTitle)).toBeNull()
  })

  it("waiting for the admin: one sentence, the message to send, the admin page, and try again", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    useConnectorStore.setState({ outcomes: { "slack-mcp": { next: "admin", authorizeUrl: null, message: "Create an internal app." } } })
    connect.mockResolvedValue({ next: "admin", authorizeUrl: null, message: "Create an internal app." })
    show(notion({ key: "slack-mcp", name: "Slack", connection: "company-app",
      admin: { text: "Create an internal app.", link: "https://docs.slack.dev/ai/slack-mcp-server/", required: true } }))

    expect(screen.getByText(t.waitingForAdmin)).toBeTruthy()
    expect(screen.getByText("Create an internal app.")).toBeTruthy()
    expect(screen.getByRole("link", { name: new RegExp(t.openAdminPage) }).getAttribute("href")).toContain("slack")
    fireEvent.click(screen.getByRole("button", { name: new RegExp(t.copyMessage) }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Create an internal app."))
    fireEvent.click(screen.getByRole("button", { name: t.tryAgain }))
    expect(connect).toHaveBeenCalled()
  })

  it("no Try again where retrying can't help: before any try, and after a refusal for the role (R161)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    const zoom = notion({ key: "zoom", name: "Zoom", connection: "company-app", state: "WAITING_FOR_ADMIN",
      admin: { text: "Create a Zoom app.", link: null, required: true } })
    const view = show(zoom)
    expect(screen.queryByRole("button", { name: t.tryAgain })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: new RegExp(t.copyMessage) }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Create a Zoom app."))
    view.unmount()

    connect.mockImplementation(async () => {
      useConnectorStore.setState({ failure: { key: "notion", kind: "forbidden", raw: "Access denied" } })
      return null
    })
    show(notion())
    fireEvent.click(screen.getByRole("button", { name: t.connect }))
    expect(await screen.findByRole("alert")).toHaveTextContent(t.failures.forbidden.replace("{name}", "Notion"))
    expect(screen.queryByRole("button", { name: t.tryAgain })).toBeNull()
  })

  it("an owner or admin enters the company's app once; the catalog is read again and the panel offers to connect (R161)", async () => {
    saveCompanyApp.mockResolvedValue(true)
    useConnectorStore.setState({ outcomes: { "slack-mcp": { next: "company-app", authorizeUrl: null, message: "Create an internal app." } } })
    show(notion({ key: "slack-mcp", name: "Slack", connection: "company-app", state: "WAITING_FOR_ADMIN",
      admin: { text: "Create an internal app.", link: null, required: true } }), true)

    expect(screen.getByText(t.companyAppTitle)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(t.clientId), { target: { value: " c-1 " } })
    fireEvent.change(screen.getByLabelText(t.clientSecret), { target: { value: "s-1" } })
    fireEvent.click(screen.getByRole("button", { name: t.saveAndConnect }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(saveCompanyApp).toHaveBeenCalledWith("acme", "slack-mcp", "c-1", "s-1")
    // Pas de départ d'emblée chez l'éditeur : la suite gardée s'efface, le panneau relu propose « Connect ».
    expect(connect).not.toHaveBeenCalled()
    expect(useConnectorStore.getState().outcomes["slack-mcp"]).toBeUndefined()
  })

  it("a failure keeps what the person typed: the step stays mounted when its note appears (R161)", async () => {
    useConnectorStore.setState({ outcomes: { stripe: { next: "key", authorizeUrl: null, message: null } } })
    connect.mockImplementation(async () => {
      useConnectorStore.setState({ failure: { key: "stripe", kind: "unknown", raw: "boom" } })
      return null
    })
    show(notion({ key: "stripe", name: "Stripe", apiKey: { hint: "Create a restricted key.", link: null } }))

    fireEvent.change(screen.getByLabelText(t.keyLabel), { target: { value: "rk_1" } })
    fireEvent.click(screen.getByRole("button", { name: t.connect }))

    expect(await screen.findByRole("alert")).toBeTruthy()
    expect((screen.getByLabelText(t.keyLabel) as HTMLInputElement).value).toBe("rk_1")
  })

  it("the guided key, and the address of the company's own server", async () => {
    useConnectorStore.setState({ outcomes: { stripe: { next: "key", authorizeUrl: null, message: null } } })
    connect.mockResolvedValue({ next: "connected", authorizeUrl: null, message: null })
    const view = show(notion({ key: "stripe", name: "Stripe", connection: "self-registration",
      apiKey: { hint: "Create a restricted key.", link: "https://docs.stripe.com/mcp" } }))

    fireEvent.change(screen.getByLabelText(t.keyLabel), { target: { value: "rk_1" } })
    fireEvent.click(screen.getByRole("button", { name: t.connect }))
    await waitFor(() => expect(connect).toHaveBeenCalledWith("acme", "stripe", { shared: false, allowWrites: false, mcpToken: "rk_1" }))
    view.unmount()

    useConnectorStore.setState({ outcomes: { zoho: { next: "key", authorizeUrl: null, message: null } } })
    show(notion({ key: "zoho", name: "Zoho", connection: "server-url", mcpSuggestedUrl: null,
      apiKey: { hint: "Create your server in the Zoho MCP console.", link: null } }))
    fireEvent.change(screen.getByLabelText(t.serverAddressLabel), { target: { value: "https://srv.zohomcp.com/mcp/k/message" } })
    fireEvent.click(screen.getByRole("button", { name: t.connect }))
    await waitFor(() => expect(connect).toHaveBeenLastCalledWith("acme", "zoho",
      { shared: false, allowWrites: false, mcpUrl: "https://srv.zohomcp.com/mcp/k/message" }))
  })

  it("when the vendor offers a key, the admin step leads to it instead", async () => {
    connect.mockResolvedValue({ next: "connected", authorizeUrl: null, message: null })
    show(notion({ key: "github-mcp", name: "GitHub", connection: "our-app", state: "WAITING_FOR_ADMIN",
      admin: { text: "Register a GitHub OAuth app.", link: null, required: true },
      apiKey: { hint: "Create a fine-grained personal access token.", link: null } }), true)

    fireEvent.click(screen.getByRole("button", { name: t.useKeyInstead }))
    fireEvent.change(screen.getByLabelText(t.keyLabel), { target: { value: "github_pat_1" } })
    fireEvent.click(screen.getByRole("button", { name: t.connect }))

    await waitFor(() => expect(connect).toHaveBeenCalledWith("acme", "github-mcp",
      { shared: false, allowWrites: false, mcpToken: "github_pat_1" }))
  })

  it("a server on this computer connects only once the person approves its address", async () => {
    useConnectorStore.setState({ outcomes: { "custom-docker": { next: "local", authorizeUrl: null,
      message: "This server runs on your computer (127.0.0.1:8811)." } } })
    connect.mockResolvedValue({ next: "connected", authorizeUrl: null, message: null })
    show(notion({ key: "custom-docker", name: "Docker" }))

    const button = screen.getByRole("button", { name: t.connect })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText(t.localConfirm))
    fireEvent.click(button)
    await waitFor(() => expect(connect).toHaveBeenCalledWith("acme", "custom-docker",
      { shared: false, allowWrites: false, localApproved: true }))
  })

  it("a tool its vendor keeps closed says why, without a Connect button", () => {
    show(notion({ key: "figma", name: "Figma", blocked: "Only clients in Figma's MCP catalog can connect." }))

    expect(screen.getByText(t.notAvailable)).toBeTruthy()
    expect(screen.queryByRole("button", { name: t.connect })).toBeNull()
  })

  it("connected: as whom, whose, what changed (approve), what Cortex can do, and disconnect that revokes", async () => {
    servers.mockResolvedValue([{ connectorKey: "notion", name: null, host: "mcp.notion.com", scope: "PERSONAL",
      state: "CONNECTED", accountLabel: "ada@acme.test", reachable: true, tools: ["notion-search"],
      changedTools: ["notion-fetch"], error: null }])
    approveTools.mockResolvedValue([])
    disconnect.mockResolvedValue({ revoked: true, revocable: true, servers: [] })
    show(notion({ connected: true, state: "CONNECTED", accountLabel: "ada@acme.test", scope: "PERSONAL" }))

    expect(screen.getByText(t.connectedAs.replace("{account}", "ada@acme.test"))).toBeTruthy()
    expect(screen.getByText(t.yours)).toBeTruthy()
    await waitFor(() => expect(screen.getByText(t.toolChanged)).toBeTruthy())
    expect(screen.getByText("Fetch")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: t.approveChanges }))
    await waitFor(() => expect(approveTools).toHaveBeenCalledWith("acme", "notion", false))

    fireEvent.click(screen.getByRole("button", { name: t.whatCortexCanDo }))
    await waitFor(() => expect(screen.getByText("Search")).toBeTruthy())
    expect(screen.getByText(t.asksFirst)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: t.disconnect }))
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Notion" }))
    await waitFor(() => expect(disconnect).toHaveBeenCalledWith("acme", "notion", false))
    expect(toast.success).toHaveBeenCalledWith(t.disconnectedRevoked.replace("{name}", "Notion"))
  })

  it("a shared source: only owners and admins change it", async () => {
    show(notion({ connected: true, state: "CONNECTED", scope: "WORKSPACE" }), false)

    expect(screen.getByText(t.shared)).toBeTruthy()
    // Une source partagée n'est pas « votre compte » : la personne lit par la connexion de l'espace.
    expect(screen.getByText(t.connected)).toBeTruthy()
    expect(screen.queryByText(t.connectedWithYourAccount)).toBeNull()
    expect(screen.queryByRole("button", { name: t.disconnect })).toBeNull()
  })

  it("says each path in the person's words", () => {
    expect(pathLabel(notion(), t)).toBe(t.pathOneClick)
    expect(pathLabel(notion({ connection: "our-app" }), t)).toBe(t.pathOneClick)
    expect(pathLabel(notion({ connection: "company-app" }), t)).toBe(t.pathAdminFirst)
    expect(pathLabel(notion({ connection: "api-key" }), t)).toBe(t.pathKey)
    expect(pathLabel(notion({ connection: "server-url" }), t)).toBe(t.pathAddress)
    expect(pathLabel(notion({ connection: "open" }), t)).toBe(t.pathOpen)
    expect(pathLabel(notion({ connection: null }), t)).toBeNull()
  })

  it("says each path in one plain sentence, never OAuth or MCP (R160)", () => {
    expect(pathSentence(notion(), t)).toBe("you sign in to Notion in your browser, then come back connected.")
    expect(pathSentence(notion({ connection: "company-app" }), t))
      .toBe("an owner or admin of this workspace sets up Notion once, then everyone connects with their own account.")
    expect(pathSentence(notion({ connection: "api-key" }), t)).toBe("you create a key in Notion and paste it here.")
    expect(pathSentence(notion({ connection: null }), t)).toBeNull()
    for (const sentence of Object.values(t.pathSentence)) expect(sentence).not.toMatch(/OAuth|MCP|token|header/)
  })
})
