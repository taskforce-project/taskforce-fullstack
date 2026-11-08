import { describe, expect, it } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { BusyMark } from "./busy-mark"
import { Named } from "./named"
import { ProgressSection } from "./progress-section"

/** Le nom au survol (R129), ce qui avance dans une ligne, et le titre d'une partie d'un onglet. */
describe("Named", () => {
  it("shows the name of what it wraps on hover", async () => {
    render(<Named name="Measure"><button type="button">x</button></Named>)

    await userEvent.setup().hover(screen.getByRole("button"))
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("Measure"))
  })

  it("keeps a sentence readable with a wider bubble", async () => {
    render(<Named name="A whole sentence" wide><button type="button">x</button></Named>)

    await userEvent.setup().hover(screen.getByRole("button"))
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("A whole sentence"))
  })
})

describe("BusyMark", () => {
  it("shows the short form and tells screen readers the whole sentence", () => {
    render(<BusyMark short="3/8" text="Measuring qwen3:8b: 3 of 8" />)

    expect(screen.getByText("3/8")).toHaveAttribute("aria-hidden")
    expect(screen.getByRole("status")).toHaveTextContent("Measuring qwen3:8b: 3 of 8")
  })

  it("leaves the announcement to its parent when it lives in a button", () => {
    render(<BusyMark short="3/8" text="Measuring" announced={false} />)

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })
})

describe("ProgressSection", () => {
  it("names its part, with what it measures on hover and its action at the right", async () => {
    render(<ProgressSection title="Over time" hint="The test bank" actions={<button type="button">Replay</button>}><p>content</p></ProgressSection>)

    expect(screen.getByRole("region", { name: "Over time" })).toHaveTextContent("content")
    expect(screen.queryByText("The test bank")).not.toBeInTheDocument()
    await userEvent.setup().hover(screen.getByRole("heading", { name: "Over time" }))
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("The test bank"))
    expect(screen.getByRole("button", { name: "Replay" })).toBeInTheDocument()
  })

  it("is a plain title without a hint", () => {
    render(<ProgressSection title="Over time"><p>content</p></ProgressSection>)

    expect(screen.getByRole("heading", { name: "Over time" })).toBeInTheDocument()
  })
})
