import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: ReactNode }) => (
    <select aria-label="choice" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">-</option>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}))

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("sonner", () => ({ toast }))

import { AddRuleDialog } from "./add-rule-dialog"
import { CEO_RULE, draft, overview } from "./rules-test-data"
import { useRulesStore } from "@/lib/store/rules-store"

const draftRule = vi.fn()
const addRule = vi.fn()
const onOpenChange = vi.fn()

function open(projectId?: number) {
  render(<AddRuleDialog open onOpenChange={onOpenChange} slug="acme" projectId={projectId} members={overview().members} />)
}

async function write(text: string) {
  fireEvent.change(screen.getByLabelText("The rule, in your words"), { target: { value: text } })
}

beforeEach(() => {
  vi.clearAllMocks()
  useRulesStore.setState({ error: null, draftRule, addRule })
})

describe("AddRuleDialog", () => {
  it("the CEO's rule: checked in words, said back with its cases, then added", async () => {
    draftRule.mockResolvedValue(draft())
    addRule.mockResolvedValue({ saved: true, draft: draft() })
    open()

    await write(CEO_RULE)
    await userEvent.click(screen.getByRole("button", { name: "Check the rule" }))

    await waitFor(() => expect(draftRule).toHaveBeenCalledWith("acme", { text: CEO_RULE, scope: "workspace", ref: null }))
    expect(screen.getByText("Asks Marie Martin first when anyone changes a file under any accounting folder.")).toBeInTheDocument()
    expect(screen.getByText("Its cases hold: you can add it.")).toBeInTheDocument()
    expect(screen.queryByText(/accounting\/\*\*/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Add the rule" }))

    await waitFor(() => expect(addRule).toHaveBeenCalledWith("acme", {
      text: CEO_RULE, scope: "workspace", ref: null, rules: draft().rules, cases: draft().modelCases,
    }))
    expect(toast.success).toHaveBeenCalledWith("Rule added")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("a rule that would loosen TaskForce is refused, with the reason, and can't be added", async () => {
    draftRule.mockResolvedValue(draft({ passed: false, cases: [], problems: [{ code: "loosens", detail: null }],
      rules: [{ when: { action: "issue.delete" }, effect: "allow" }] }))
    open()

    await write("Agents may delete issues without asking")
    await userEvent.click(screen.getByRole("button", { name: "Check the rule" }))

    expect(await screen.findByText(/can only make TaskForce stricter/)).toBeInTheDocument()
    expect(screen.getByText("A case doesn't hold, so TaskForce won't add the rule as it is written.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add the rule" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument()
  })

  it("when TaskForce doesn't know who approves, it asks, then checks the same rule again without the model", async () => {
    const unresolved = draft({ passed: false, approverNeeded: "the finance lead",
      rules: [{ when: { action: "file.write", path: "**/accounting/**" }, effect: "ask" }] })
    draftRule.mockResolvedValueOnce(unresolved).mockResolvedValueOnce(draft())
    open()

    await write(CEO_RULE)
    await userEvent.click(screen.getByRole("button", { name: "Check the rule" }))
    expect(await screen.findByText("Who approves? (“the finance lead”)")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Check again" })).toBeDisabled()

    const selects = screen.getAllByRole("combobox")
    fireEvent.change(selects[selects.length - 1]!, { target: { value: "person:42" } })
    await userEvent.click(screen.getByRole("button", { name: "Check again" }))

    await waitFor(() => expect(draftRule).toHaveBeenLastCalledWith("acme", {
      text: CEO_RULE, scope: "workspace", ref: null,
      rules: [{ when: { action: "file.write", path: "**/accounting/**" }, effect: "ask", require: { approvers: ["person:42"] } }],
      cases: unresolved.modelCases,
    }))
    expect(await screen.findByRole("button", { name: "Add the rule" })).toBeInTheDocument()
  })

  it("a rule refused at save time shows its check again", async () => {
    draftRule.mockResolvedValue(draft())
    addRule.mockResolvedValue({ saved: false, draft: draft({ passed: false, problems: [{ code: "alreadyThere", detail: null }] }) })
    open()

    await write(CEO_RULE)
    await userEvent.click(screen.getByRole("button", { name: "Check the rule" }))
    await userEvent.click(await screen.findByRole("button", { name: "Add the rule" }))

    expect(await screen.findByText("This rule is already there.")).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it("for a role or one person of the workspace, and in a project, for that project", async () => {
    draftRule.mockResolvedValue(draft())
    open()
    fireEvent.change(screen.getAllByRole("combobox")[0]!, { target: { value: "role:MEMBER" } })
    await write("x")
    await userEvent.click(screen.getByRole("button", { name: "Check the rule" }))
    await waitFor(() => expect(draftRule).toHaveBeenLastCalledWith("acme", { text: "x", scope: "role", ref: "MEMBER" }))

    fireEvent.change(screen.getAllByRole("combobox")[0]!, { target: { value: "person" } })
    expect(screen.getByRole("button", { name: "Check the rule" })).toBeDisabled()
    fireEvent.change(screen.getAllByRole("combobox")[1]!, { target: { value: "42" } })
    await userEvent.click(screen.getByRole("button", { name: "Check the rule" }))
    await waitFor(() => expect(draftRule).toHaveBeenLastCalledWith("acme", { text: "x", scope: "person", ref: "42" }))
  })

  it("in a project's settings, the rule goes to that project", async () => {
    draftRule.mockResolvedValue(draft())
    open(12)

    expect(screen.queryByText("Where it applies")).not.toBeInTheDocument()
    await write("x")
    await userEvent.click(screen.getByRole("button", { name: "Check the rule" }))

    await waitFor(() => expect(draftRule).toHaveBeenCalledWith("acme", { text: "x", scope: "project", ref: "12" }))
  })

  it("says when the model couldn't answer, and when the words changed since the check", async () => {
    draftRule.mockImplementationOnce(async () => {
      useRulesStore.setState({ error: "Your workspace's model didn't answer. Try again in a moment." })
      return null
    }).mockResolvedValueOnce(draft())
    open()

    await write(CEO_RULE)
    await userEvent.click(screen.getByRole("button", { name: "Check the rule" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("didn't answer")

    await userEvent.click(screen.getByRole("button", { name: "Check the rule" }))
    await screen.findByRole("button", { name: "Add the rule" })
    await write(`${CEO_RULE}.`)
    expect(screen.getByText("Your words changed: check the rule again.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Check the rule" })).toBeInTheDocument()
  })

  it("the rule format is one more click away", async () => {
    draftRule.mockResolvedValue(draft({ unclear: "TaskForce doesn't see emails.", broken: [draft().cases[1]!] }))
    open()

    await write(CEO_RULE)
    await userEvent.click(screen.getByRole("button", { name: "Check the rule" }))
    expect(await screen.findByText("What TaskForce couldn't say with its rules: TaskForce doesn't see emails.")).toBeInTheDocument()
    expect(screen.getByText("It would change what these rules already do:")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Show the rule format" }))
    expect(screen.getByText(/"approvers"/)).toBeInTheDocument()
  })
})
