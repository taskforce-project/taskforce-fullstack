import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { RulesPanel } from "./rules-panel"
import { CEO_RULE, CEO_STATEMENT, overview } from "./rules-test-data"
import { useRulesStore } from "@/lib/store/rules-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("sonner", () => ({ toast }))

const fetchRules = vi.fn()
const removeRule = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  fetchRules.mockResolvedValue(null)
  useWorkspaceStore.setState({ activeWorkspace: { slug: "acme" } as never })
  useRulesStore.setState({ overview: overview(), slug: "acme", loading: false, loadFailed: false, error: null, fetchRules, removeRule })
})

describe("RulesPanel", () => {
  it("shows the floor, the workspace's rules as sentences with who wrote them, and reads them again", async () => {
    render(<RulesPanel />)

    expect(screen.getByText("Always, whatever the rules")).toBeInTheDocument()
    expect(screen.getByText("An action that can't be undone never runs without a person's decision.")).toBeInTheDocument()
    expect(screen.getByText(CEO_RULE)).toBeInTheDocument()
    expect(screen.getByText("Added by Pierre on 11 Nov 2026")).toBeInTheDocument()
    expect(screen.queryByText(/"path"/)).not.toBeInTheDocument()
    await waitFor(() => expect(fetchRules).toHaveBeenCalledWith("acme"))
  })

  it("what TaskForce understood and the cases are one click away, the rule format two", async () => {
    render(<RulesPanel />)

    await userEvent.click(screen.getByRole("button", { name: "Details" }))
    expect(screen.getByText("Asks Marie Martin first when anyone changes a file under any accounting folder.")).toBeInTheDocument()
    expect(screen.getByText("Claude Code changes src/accounting/ledger.ts")).toBeInTheDocument()
    expect(screen.queryByText(/accounting\/\*\*/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Show the rule format" }))
    expect(screen.getByText(/"path": "\*\*\/accounting\/\*\*"/)).toBeInTheDocument()
  })

  it("removes a rule after a confirmation", async () => {
    removeRule.mockResolvedValue(true)
    render(<RulesPanel />)

    await userEvent.click(screen.getByRole("button", { name: "Remove this rule" }))
    await userEvent.click(screen.getByRole("button", { name: "Remove" }))

    await waitFor(() => expect(removeRule).toHaveBeenCalledWith("acme", "workspace", null, CEO_STATEMENT.group))
    expect(toast.success).toHaveBeenCalledWith("Rule removed")
  })

  it("a member reads the rules, without adding or removing", () => {
    useRulesStore.setState({ overview: overview({ canEdit: false, layers: [{ ...overview().layers[0]!, canEdit: false }] }) })
    render(<RulesPanel />)

    expect(screen.queryByRole("button", { name: "Add a rule" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Remove this rule" })).not.toBeInTheDocument()
    expect(screen.getByText("Only an owner or admin of the workspace changes these rules.")).toBeInTheDocument()
  })

  it("in a project: this project's rules first, then those of the workspace, read-only", () => {
    render(<RulesPanel projectId={12} slug="acme" />)

    expect(screen.getByText("This project")).toBeInTheDocument()
    expect(screen.getByText("No rule of your own yet.")).toBeInTheDocument()
    expect(screen.getByText("From your workspace")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add a rule" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Remove this rule" })).not.toBeInTheDocument()
  })

  it("TaskForce's own rules and the history stay folded until asked", async () => {
    render(<RulesPanel />)

    await userEvent.click(screen.getByRole("button", { name: "Show TaskForce's 1 rules" }))
    expect(screen.getByText("Lets an agent read a file.")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Show the history" }))
    expect(screen.getByText(/Version 2: This workspace, by Pierre on 11 Nov 2026/)).toBeInTheDocument()
  })

  it("says when the rules couldn't be read, and tries again", async () => {
    useRulesStore.setState({ overview: null, loadFailed: true })
    render(<RulesPanel />)

    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(fetchRules).toHaveBeenCalledTimes(2)
  })

  it("shows the other layers by their names", () => {
    const base = overview()
    useRulesStore.setState({ overview: overview({ layers: [...base.layers,
      { ...base.layers[0]!, scope: "role", ref: "MEMBER", name: "MEMBER" },
      { ...base.layers[0]!, scope: "person", ref: "42", name: "Marie Martin" },
      { ...base.layers[0]!, scope: "project", ref: "12", name: "Accounting" }] }) })
    render(<RulesPanel />)

    expect(screen.getByText("Everyone who is a member")).toBeInTheDocument()
    expect(screen.getByText("Marie Martin")).toBeInTheDocument()
    expect(screen.getByText("Project Accounting")).toBeInTheDocument()
  })
})
