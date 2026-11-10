import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CompactedNotice, ContextFitNotice } from "./context-fit-notice"

describe("ContextFitNotice", () => {
  it("one quiet line, the detail on hover", () => {
    render(<ContextFitNotice context={{ summarized: 12, leftOut: 0, toolResults: 0 }} model="qwen3:8b" />)

    expect(screen.getByText("Earlier messages summarized to fit qwen3:8b's context")).toHaveAttribute("title", "12 messages summarized")
  })

  it("nothing when nothing was touched", () => {
    const { container } = render(<ContextFitNotice context={null} model="qwen3:8b" />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe("CompactedNotice", () => {
  it("what /compact did, the count on hover", () => {
    render(<CompactedNotice compacted={8} />)

    expect(screen.getByText("Conversation compacted")).toHaveAttribute("title", "8 messages summarized")
  })

  it("nothing to compact yet", () => {
    render(<CompactedNotice compacted={0} />)

    expect(screen.getByText("Nothing to compact yet")).toBeInTheDocument()
  })

  it("a pending line says it works", () => {
    render(<CompactedNotice compacted={0} compacting />)

    expect(screen.getByRole("status")).toHaveTextContent("Compacting the conversation…")
  })

  it("the line opens the summary with a chevron, and says the thread stays whole", () => {
    render(<CompactedNotice compacted={8} summary="What was decided." />)

    const line = screen.getByRole("button", { name: "Conversation compacted" })
    expect(line).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("What was decided.")).not.toBeInTheDocument()

    fireEvent.click(line)

    expect(line).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("What was decided.")).toBeInTheDocument()
    expect(screen.getByText(/This thread stays whole/)).toBeInTheDocument()
  })

  it("a failure says what happened, in place of the line", () => {
    render(<CompactedNotice compacted={0} problem="Nothing changed in this conversation. qwen3:8b took more than 180 seconds." />)

    expect(screen.getByRole("alert")).toHaveTextContent("Nothing changed in this conversation.")
  })
})
