import { render, screen } from "@testing-library/react"
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
})
