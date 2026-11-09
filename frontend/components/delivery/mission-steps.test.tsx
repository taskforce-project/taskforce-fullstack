import { describe, expect, it } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

import { MissionStepIcon, MissionSteps, timeOf } from "./mission-steps"
import type { MissionLine, MissionStep, MissionStepState } from "@/lib/delivery/mission-sequence"

const line = (seq: number, sentence: string, over: Partial<MissionLine> = {}): MissionLine =>
  ({ seq, sentence, raw: `raw ${sentence}`, at: "2026-11-09T00:45:00", failed: false, ...over })

const STEPS: readonly MissionStep[] = [
  { key: "understand", name: "Understand", state: "done", sentence: "Read the issue", lines: [line(1, "Read the issue")], current: false },
  { key: "plan", name: "Plan", state: "skipped", sentence: "Skipped", lines: [], current: false },
  { key: "do", name: "Do", state: "in-progress", sentence: "Wrote c2.md", lines: [line(2, "Wrote c1.md"), line(3, "Wrote c2.md")], current: true },
  { key: "check", name: "Check", state: "not-started", sentence: "Not started", lines: [], current: false },
  { key: "handover", name: "Hand over", state: "not-started", sentence: "Not started", lines: [], current: false },
]

const rows = () => screen.getAllByRole("listitem").filter((li) => within(li).queryAllByRole("button").length > 0)
const row = (name: RegExp) => screen.getByRole("button", { name })

/** Le déroulé : cinq lignes, l'étape en cours ouverte, chacune se déplie d'un clic (R138, « Le dessin »). */
describe("MissionSteps", () => {
  it("shows the five steps, with their state and their sentence", () => {
    render(<MissionSteps steps={STEPS} showCommands={false} />)

    expect(rows()).toHaveLength(5)
    expect(row(/^Done Understand Read the issue/)).toHaveAttribute("aria-expanded", "false")
    expect(row(/^Did not happen Plan Skipped/)).toBeInTheDocument()
    expect(row(/^In progress Do Wrote c2.md/)).toHaveAttribute("aria-expanded", "true")
    expect(row(/^Not started Check/)).toBeInTheDocument()
  })

  it("opens the current step, and only it", () => {
    render(<MissionSteps steps={STEPS} showCommands={false} />)

    expect(screen.getByText("Wrote c1.md")).toBeInTheDocument()
    expect(screen.getAllByText("Read the issue")).toHaveLength(1)
  })

  it("unfolds a step on a click, and folds it back", () => {
    render(<MissionSteps steps={STEPS} showCommands={false} />)

    fireEvent.click(row(/^Done Understand/))
    expect(screen.getAllByText("Read the issue")).toHaveLength(2)
    expect(row(/^Done Understand/)).toHaveAttribute("aria-expanded", "true")

    fireEvent.click(row(/^Done Understand/))
    expect(screen.getAllByText("Read the issue")).toHaveLength(1)
  })

  it("keeps a step the person closed closed when the mission moves on, and follows otherwise", () => {
    const { rerender } = render(<MissionSteps steps={STEPS} showCommands={false} />)
    fireEvent.click(row(/^In progress Do/))
    expect(screen.queryByText("Wrote c1.md")).toBeNull()

    const moved = STEPS.map((step) => step.key === "understand" ? { ...step, current: true } : step)
    rerender(<MissionSteps steps={moved} showCommands={false} />)

    expect(screen.queryByText("Wrote c1.md")).toBeNull()
    expect(row(/^Done Understand/)).toHaveAttribute("aria-expanded", "true")
  })

  it("reads repeated sentences once, with their number", () => {
    const repeated = [{ ...STEPS[2], lines: [line(1, "Commented on the issue"), line(2, "Commented on the issue"), line(3, "Commented on the issue")] }]
    render(<MissionSteps steps={repeated} showCommands={false} />)

    expect(screen.getAllByText(/^Commented on the issue/)).toHaveLength(1)
    expect(screen.getByText("· 3 times")).toBeInTheDocument()
  })

  it("the switch brings the raw lines with their times, one by one", () => {
    const repeated = [{ ...STEPS[2], lines: [line(1, "Commented on the issue", { raw: "taskforce: add_comment {1}" }), line(2, "Commented on the issue", { raw: "taskforce: add_comment {2}" })] }]
    render(<MissionSteps steps={repeated} showCommands />)

    expect(screen.getByText("taskforce: add_comment {1}")).toBeInTheDocument()
    expect(screen.getByText("taskforce: add_comment {2}")).toBeInTheDocument()
    expect(screen.getAllByText(timeOf("2026-11-09T00:45:00"))).toHaveLength(2)
  })

  it("shows no raw line when the switch is off", () => {
    render(<MissionSteps steps={STEPS} showCommands={false} />)
    expect(screen.queryByText("raw Wrote c1.md")).toBeNull()
  })

  it("marks a line that failed", () => {
    render(<MissionSteps steps={[{ ...STEPS[2], lines: [line(1, "That didn't work", { failed: true })] }]} showCommands={false} />)
    expect(screen.getByText("That didn't work")).toHaveClass("text-destructive")
  })

  it("keeps a long step short, the latest lines first in view, and shows the rest on a click", () => {
    const lines = Array.from({ length: 11 }, (_, i) => line(i, `Wrote f${i}.md`))
    render(<MissionSteps steps={[{ ...STEPS[2], lines }]} showCommands={false} />)

    expect(screen.queryByText("Wrote f2.md")).toBeNull()
    expect(screen.getByText("Wrote f3.md")).toBeInTheDocument()
    expect(screen.getByText("Wrote f10.md")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Show 3 earlier" }))
    expect(screen.getByText("Wrote f0.md")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /earlier/ })).toBeNull()
  })

  describe("what waits for the person", () => {
    const waiting = STEPS.map((step) => step.key === "do" ? { ...step, state: "waiting" as MissionStepState, sentence: "Wants to run a script" } : step)

    it("shows inside its step, and the step stays open until it's answered", () => {
      render(<MissionSteps steps={waiting} showCommands={false} waiting={<p>The request</p>} />)
      expect(screen.getByText("The request")).toBeInTheDocument()

      fireEvent.click(row(/^Waiting for you Do/))

      expect(screen.getByText("The request")).toBeInTheDocument()
      expect(row(/^Waiting for you Do/)).toHaveAttribute("aria-expanded", "true")
    })

    it("names the wait for a teammate", () => {
      render(<MissionSteps steps={waiting} showCommands={false} waitingLabel="Waiting for an answer" />)
      expect(row(/^Waiting for an answer Do/)).toBeInTheDocument()
    })

    it("a hand-over waiting for a review has no request to hold: it folds", () => {
      const review = STEPS.map((step) => step.key === "handover" ? { ...step, state: "waiting" as MissionStepState, current: true, lines: [line(9, "Wrote its account")] } : { ...step, current: false })
      render(<MissionSteps steps={review} showCommands={false} />)

      fireEvent.click(row(/^Waiting for you Hand over/))
      expect(screen.queryByText("Wrote its account")).toBeNull()
    })
  })
})

describe("MissionStepIcon", () => {
  it.each([
    ["not-started", "Not started"], ["in-progress", "In progress"], ["waiting", "Waiting for you"], ["done", "Done"],
    ["skipped", "Did not happen"], ["failed", "Failed"], ["stopped", "Stopped"],
  ] as const)("names %s for a screen reader and on hover", (state, label) => {
    render(<MissionStepIcon state={state} label={label} />)
    const icon = screen.getByRole("img", { name: label })
    expect(icon).toHaveAttribute("title", label)
    expect(icon).toHaveAttribute("data-state", state)
  })

  it("doesn't spin under reduced motion", () => {
    const { container } = render(<MissionStepIcon state="in-progress" label="x" />)
    expect(container.querySelector("svg")).toHaveClass("motion-reduce:animate-none")
  })
})

describe("timeOf", () => {
  it("says nothing without a time", () => {
    expect(timeOf(null)).toBe("")
  })
})
