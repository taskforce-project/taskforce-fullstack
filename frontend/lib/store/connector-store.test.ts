import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import * as service from "../api/integration-service"
import type { McpServerStatus } from "../api/integration-service"
import { useConnectorStore } from "./connector-store"

vi.mock("../api/integration-service", () => ({
  approveMcpTools: vi.fn(),
  connectTool: vi.fn(),
  disconnectMcpServer: vi.fn(),
  getMcpServers: vi.fn(),
  saveCompanyApp: vi.fn(),
}))

const status = (state: McpServerStatus["state"]): McpServerStatus => ({
  connectorKey: "notion", name: null, host: "mcp.notion.com", scope: "PERSONAL", state,
  accountLabel: "ada@acme.test", reachable: true, tools: ["notion-search"], changedTools: [], error: null,
})

describe("useConnectorStore", () => {
  beforeEach(() => {
    useConnectorStore.setState({ outcomes: {}, busy: null, waiting: null, error: null, failure: null })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("keeps the next step the server chose, per tool", async () => {
    vi.mocked(service.connectTool).mockResolvedValue({ next: "browser", authorizeUrl: "https://vendor.test/a", message: null })

    const outcome = await useConnectorStore.getState().connect("acme", "notion", { allowWrites: false })

    expect(outcome?.next).toBe("browser")
    expect(service.connectTool).toHaveBeenCalledWith("acme", "notion", { allowWrites: false })
    expect(useConnectorStore.getState().outcomes.notion?.authorizeUrl).toBe("https://vendor.test/a")
    expect(useConnectorStore.getState().busy).toBeNull()
  })

  it("returns null and says the failure, without throwing", async () => {
    vi.mocked(service.connectTool).mockRejectedValue(new Error("Only owners and admins can do this."))

    expect(await useConnectorStore.getState().connect("acme", "notion", { shared: true })).toBeNull()
    expect(useConnectorStore.getState().error).toBe("Only owners and admins can do this.")
    // La raison du geste qui a échoué, pour la phrase du panneau (R160).
    expect(useConnectorStore.getState().failure).toEqual({ key: "notion", kind: "unknown", raw: "Only owners and admins can do this." })
  })

  it("a new gesture, or forgetting the tool, clears its failure; another tool's stays", async () => {
    useConnectorStore.setState({ failure: { key: "notion", kind: "unknown", raw: null } })
    useConnectorStore.getState().forget("linear")
    expect(useConnectorStore.getState().failure?.key).toBe("notion")
    useConnectorStore.getState().forget("notion")
    expect(useConnectorStore.getState().failure).toBeNull()

    useConnectorStore.setState({ failure: { key: "notion", kind: "unknown", raw: null } })
    vi.mocked(service.connectTool).mockResolvedValue({ next: "connected", authorizeUrl: null, message: null })
    await useConnectorStore.getState().connect("acme", "notion", {})
    expect(useConnectorStore.getState().failure).toBeNull()
  })

  it("waits until the connection shows up, then stops", async () => {
    vi.useFakeTimers()
    vi.mocked(service.getMcpServers)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([status("CONNECTED")])

    const done = useConnectorStore.getState().waitForConnection("acme", "notion", { intervalMs: 100, timeoutMs: 10_000 })
    expect(useConnectorStore.getState().waiting).toBe("notion")
    await vi.advanceTimersByTimeAsync(350)

    expect(await done).toBe(true)
    expect(useConnectorStore.getState().waiting).toBeNull()
  })

  it("gives up after the deadline, or when the person cancels", async () => {
    vi.useFakeTimers()
    vi.mocked(service.getMcpServers).mockResolvedValue([status("NEEDS_RECONNECT")])

    const late = useConnectorStore.getState().waitForConnection("acme", "notion", { intervalMs: 100, timeoutMs: 250 })
    await vi.advanceTimersByTimeAsync(400)
    expect(await late).toBe(false)

    const cancelled = useConnectorStore.getState().waitForConnection("acme", "notion", { intervalMs: 100 })
    useConnectorStore.getState().stopWaiting()
    await vi.advanceTimersByTimeAsync(200)
    expect(await cancelled).toBe(false)
    expect(useConnectorStore.getState().waiting).toBeNull()
  })

  it("disconnects, forgets the step, and says whether the vendor revoked the access", async () => {
    useConnectorStore.setState({ outcomes: { notion: { next: "connected", authorizeUrl: null, message: null } } })
    vi.mocked(service.disconnectMcpServer).mockResolvedValue({ revoked: true, revocable: true, servers: [] })

    const result = await useConnectorStore.getState().disconnect("acme", "notion", false)

    expect(result?.revoked).toBe(true)
    expect(service.disconnectMcpServer).toHaveBeenCalledWith("acme", "notion", false)
    expect(useConnectorStore.getState().outcomes.notion).toBeUndefined()
  })

  it("returns null when the disconnection fails", async () => {
    vi.mocked(service.disconnectMcpServer).mockRejectedValue(new Error("nope"))
    expect(await useConnectorStore.getState().disconnect("acme", "notion", true)).toBeNull()
    expect(useConnectorStore.getState().error).toBe("nope")
  })

  it("approves changed tools, and returns null on failure", async () => {
    vi.mocked(service.approveMcpTools).mockResolvedValueOnce([status("CONNECTED")]).mockRejectedValueOnce(new Error("x"))

    expect(await useConnectorStore.getState().approveTools("acme", "notion", false)).toHaveLength(1)
    expect(await useConnectorStore.getState().approveTools("acme", "notion", false)).toBeNull()
  })

  it("saves the company's app, and returns false on failure", async () => {
    vi.mocked(service.saveCompanyApp).mockResolvedValueOnce({ connectorKey: "slack-mcp", clientId: "c", hasSecret: true })
      .mockRejectedValueOnce(new Error("Only owners and admins can do this."))

    expect(await useConnectorStore.getState().saveCompanyApp("acme", "slack-mcp", "c", "s")).toBe(true)
    expect(await useConnectorStore.getState().saveCompanyApp("acme", "slack-mcp", "c", "s")).toBe(false)
    expect(useConnectorStore.getState().error).toBe("Only owners and admins can do this.")
  })

  it("reads the person's connections, and returns null when it can't", async () => {
    vi.mocked(service.getMcpServers).mockResolvedValueOnce([status("CONNECTED")]).mockRejectedValueOnce(new Error("down"))

    expect(await useConnectorStore.getState().servers("acme")).toHaveLength(1)
    expect(await useConnectorStore.getState().servers("acme")).toBeNull()
  })

  it("forgets a tool's step", () => {
    useConnectorStore.setState({ outcomes: { notion: { next: "admin", authorizeUrl: null, message: "Ask" } }, error: "x" })
    useConnectorStore.getState().forget("notion")
    expect(useConnectorStore.getState().outcomes).toEqual({})
    expect(useConnectorStore.getState().error).toBeNull()
  })
})
