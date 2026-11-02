import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { AnswerText } from "./answer-text"
import { CONSTANTS_EN } from "@/lib/constants_en"

const t = CONSTANTS_EN.cortex

describe("AnswerText : ce que TaskForce dit se voit comme sa parole (R116)", () => {
  it("shows the correction under TaskForce's name, apart from Cortex's words", () => {
    render(<AnswerText text={"Here are the issues.\n\n> [!taskforce] TaskForce\n> Nothing was deleted in this turn.\n\nAnything else?"} />)

    const note = screen.getByRole("note", { name: t.taskforceSaysLabel })
    expect(note).toHaveAttribute("data-by", "taskforce")
    expect(note).toHaveAttribute("title", t.taskforceSaysHint)
    expect(note).toHaveTextContent(t.taskforceSays)
    expect(note).toHaveTextContent(t.taskforceSaysWhat)
    expect(note).toHaveTextContent("Nothing was deleted in this turn.")
    expect(note).not.toHaveTextContent("Here are the issues.")
    expect(screen.getByText("Here are the issues.")).toBeInTheDocument()
    expect(screen.getByText("Anything else?")).toBeInTheDocument()
    expect(screen.queryByText(/\[!taskforce\]/i)).not.toBeInTheDocument()
  })

  it("renders an answer without a correction as Cortex's markdown only", () => {
    render(<AnswerText text={"TESTTA-2 is in **In review by AI**."} />)

    expect(screen.queryByRole("note")).not.toBeInTheDocument()
    expect(screen.getByText("In review by AI").tagName).toBe("STRONG")
  })
})
