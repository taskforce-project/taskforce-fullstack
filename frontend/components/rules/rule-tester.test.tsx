import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { RuleTester } from "./rule-tester"
import { CEO_CASE, CEO_RULE } from "./rules-test-data"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { useRulesStore } from "@/lib/store/rules-store"

const checkAction = vi.fn()
const t = CONSTANTS_EN.rules

beforeEach(() => {
  vi.clearAllMocks()
  useRulesStore.setState({ error: null, checkAction })
})

async function ask(text: string) {
  fireEvent.change(screen.getByLabelText("An action"), { target: { value: text } })
  await userEvent.click(screen.getByRole("button", { name: "Check" }))
}

describe("RuleTester", () => {
  it("what would happen: the decision first, then how TaskForce read it and the rule that decided", async () => {
    checkAction.mockResolvedValue({ facts: CEO_CASE.facts, decision: CEO_CASE.decision, unclear: null })
    render(<RuleTester slug="acme" projectId={12} t={t} />)

    await ask("Claude Code changes the ledger in the accounting module")

    await waitFor(() => expect(checkAction).toHaveBeenCalledWith("acme", "Claude Code changes the ledger in the accounting module", 12))
    expect(screen.getByText("Asks Marie Martin first")).toBeInTheDocument()
    expect(screen.getByText("TaskForce read it as: An agent changes a file at src/accounting/ledger.ts")).toBeInTheDocument()
    expect(screen.getByText(`Because: ${CEO_RULE}`)).toBeInTheDocument()
    expect(screen.getByText("From: This workspace's rules")).toBeInTheDocument()
  })

  it("an action TaskForce can't judge says so", async () => {
    checkAction.mockResolvedValue({ facts: null, decision: null, unclear: "TaskForce doesn't send emails." })
    render(<RuleTester slug="acme" projectId={null} t={t} />)

    await ask("Send an email to the client")

    expect(await screen.findByText("TaskForce can't judge this: TaskForce doesn't send emails.")).toBeInTheDocument()
  })

  it("a failure says what happened", async () => {
    checkAction.mockResolvedValue(null)
    render(<RuleTester slug="acme" projectId={null} t={t} />)

    await ask("x")

    expect(await screen.findByRole("alert")).toHaveTextContent("TaskForce couldn't check this action. Try again.")
  })
})
