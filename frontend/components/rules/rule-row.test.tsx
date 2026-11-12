import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { RuleRow } from "./rule-row"
import { RuleCaseList } from "./rule-case-list"
import { BESIDE_CASE, CEO_CASE, CEO_RULE, CEO_STATEMENT } from "./rules-test-data"
import { CONSTANTS_EN } from "@/lib/constants_en"

const t = CONSTANTS_EN.rules

describe("RuleRow", () => {
  it("the person's sentence first, with who wrote it and when", () => {
    render(<ul><RuleRow statement={CEO_STATEMENT} t={t} canEdit onRemove={vi.fn()} /></ul>)

    expect(screen.getByText(CEO_RULE)).toBeInTheDocument()
    expect(screen.getByText("Added by Pierre on 11 Nov 2026")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Remove this rule" })).toHaveAttribute("title", "Remove this rule")
  })

  it("without its author, the date alone; without the right to edit, no removal", () => {
    render(<ul><RuleRow statement={{ ...CEO_STATEMENT, addedBy: null }} t={t} canEdit={false} onRemove={vi.fn()} /></ul>)

    expect(screen.getByText("Added on 11 Nov 2026")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Remove this rule" })).not.toBeInTheDocument()
  })

  it("a removal that fails keeps the confirmation open", async () => {
    const onRemove = vi.fn().mockResolvedValue(false)
    render(<ul><RuleRow statement={CEO_STATEMENT} t={t} canEdit onRemove={onRemove} /></ul>)

    await userEvent.click(screen.getByRole("button", { name: "Remove this rule" }))
    await userEvent.click(screen.getByRole("button", { name: "Remove" }))

    await waitFor(() => expect(onRemove).toHaveBeenCalled())
    expect(screen.getByText("Remove this rule?")).toBeInTheDocument()
  })
})

describe("RuleCaseList", () => {
  it("each case in a sentence, what the rules decide, and whether it holds", () => {
    render(<RuleCaseList cases={[CEO_CASE, { ...BESIDE_CASE, passed: false }]} t={t} />)

    expect(screen.getByText("Claude Code changes src/accounting/ledger.ts")).toBeInTheDocument()
    expect(screen.getByText("An agent changes a file at docs/notes.md")).toBeInTheDocument()
    expect(screen.getByLabelText("Holds")).toBeInTheDocument()
    expect(screen.getByLabelText("Doesn't hold")).toBeInTheDocument()
  })

  it("no case, nothing", () => {
    const { container } = render(<RuleCaseList cases={[]} t={t} />)
    expect(container).toBeEmptyDOMElement()
  })
})
