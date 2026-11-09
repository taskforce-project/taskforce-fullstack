import { beforeEach, describe, expect, it } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

import { Improvements } from "./improvements"
import type { EvalHistory } from "@/lib/api/eval-service"
import { useEvalStore } from "@/lib/store/eval-store"

const HISTORY: EvalHistory = {
  runs: [
    { id: 8, model: "default", answeredBy: "qwen3:8b", startedAt: "2026-11-02T16:00:00", finishedAt: "2026-11-02T16:04:00", total: 6, graded: 6, passed: 1 },
    { id: 9, model: "qwen3:8b", answeredBy: "qwen3:8b", startedAt: "2026-11-07T10:00:00", finishedAt: "2026-11-07T10:03:00", total: 6, graded: 6, passed: 5 },
  ],
  cases: [
    {
      id: 41, title: "What changed this week", question: "What changed in this project this week?", askedOn: "2026-11-02",
      addedAt: "2026-11-02T15:20:00", mine: false, origin: { kind: "answer", said: [], shown: null }, grades: [],
    },
    {
      id: 40, title: "R118 4/6: delete TESTTA-2", question: "suprime testta 2", askedOn: "2026-11-02",
      addedAt: "2026-11-02T15:10:00", mine: true,
      origin: { kind: "incident", said: ["I deleted TESTTA-2."], shown: "Nothing was deleted." },
      grades: [{ runId: 8, passed: false }, { runId: 9, passed: true }],
    },
    {
      id: 42, title: "Create an issue Test", question: "Crée une issue Test", askedOn: "2026-11-09",
      addedAt: "2026-11-09T01:00:00", mine: true, origin: { kind: "answer", said: [], shown: null }, grades: [],
      expected: "It should have asked which project.", waiting: true, record: "r-42",
    },
  ],
}

const row = (title: string) => screen.getByText(title).closest("li") as HTMLElement
const open = (title: string) => fireEvent.click(within(row(title)).getAllByRole("button")[0])

/** Ce qui a amélioré Cortex (R125, E17) : une ligne par cas ; d'où il vient et sa note depuis, à un clic (R129). */
describe("Improvements", () => {
  beforeEach(() => useEvalStore.setState({ history: HISTORY }))

  /** R137, R61 : un cas fait d'une phrase se lit avec elle, en attente de ses critères ; aucun rejeu ne le note avant. */
  it("shows a case made of a sentence, waiting for its criteria", () => {
    render(<Improvements slug="acme" />)

    const sentence = "It should have asked which project."
    expect(within(row(sentence)).getByRole("img", { name: "Waiting for its criteria" })).toBeInTheDocument()
    expect(within(row(sentence)).getByText("Waiting for its criteria")).toBeInTheDocument()
    open(sentence)
    const item = row(sentence)
    expect(within(item).getByText("Crée une issue Test")).toBeInTheDocument()
    expect(within(item).queryByText("Not replayed since it was added.")).not.toBeInTheDocument()
    expect(within(item).getByRole("button", { name: "Write its criteria" })).toBeInTheDocument()
  })

  it("says what it should have done once the criteria are written", () => {
    useEvalStore.setState({ history: { ...HISTORY, cases: [{ ...HISTORY.cases[2], waiting: false, record: null }] } })
    render(<Improvements slug="acme" />)

    open("Create an issue Test")

    expect(screen.getByText("What it should have done: It should have asked which project.")).toBeInTheDocument()
  })

  it("only its author can write the criteria from here", () => {
    useEvalStore.setState({ history: { ...HISTORY, cases: [{ ...HISTORY.cases[2], mine: false }] } })
    render(<Improvements slug="acme" />)

    open("It should have asked which project.")

    expect(screen.queryByRole("button", { name: "Write its criteria" })).not.toBeInTheDocument()
  })

  it("shows one line per case and its last result; nothing else at first", () => {
    render(<Improvements slug="acme" />)

    expect(screen.getByRole("region", { name: "What improved it" })).toBeInTheDocument()
    expect(within(row("R118 4/6: delete TESTTA-2")).getByRole("img", { name: "qwen3:8b, 7 Nov: passed" })).toBeInTheDocument()
    expect(within(row("What changed this week")).getByRole("img", { name: "Not replayed since it was added." })).toBeInTheDocument()
    expect(screen.queryByText("suprime testta 2")).not.toBeInTheDocument()
    expect(screen.queryByText(/From a trust incident/)).not.toBeInTheDocument()
  })

  it("tells where a case came from, one click away: the trust incident, what Cortex said and what TaskForce showed", () => {
    render(<Improvements slug="acme" />)

    open("R118 4/6: delete TESTTA-2")
    const incident = row("R118 4/6: delete TESTTA-2")
    expect(within(incident).getByText("From a trust incident on 2 Nov: TaskForce corrected the answer.")).toBeInTheDocument()
    expect(within(incident).getByText("suprime testta 2")).toBeInTheDocument()
    expect(within(incident).getByText("Cortex said: I deleted TESTTA-2.")).toBeInTheDocument()
    expect(within(incident).getByText("TaskForce showed: Nothing was deleted.")).toBeInTheDocument()
    expect(within(incident).getByText("Added on 2 Nov by you.")).toBeInTheDocument()
  })

  it("gives a case's result at each replay since, by model, and the last one", () => {
    render(<Improvements slug="acme" />)

    open("R118 4/6: delete TESTTA-2")
    const incident = row("R118 4/6: delete TESTTA-2")
    expect(within(incident).getByRole("img", { name: "qwen3:8b, 2 Nov: failed" })).toBeInTheDocument()
    expect(within(incident).getByText("passed on 7 Nov")).toBeInTheDocument()
  })

  it("says a case not replayed since it was added, from an answer of someone else; a click closes it", () => {
    render(<Improvements slug="acme" />)

    open("What changed this week")
    const answer = row("What changed this week")
    expect(within(answer).getByText("From an answer of Cortex on 2 Nov.")).toBeInTheDocument()
    expect(within(answer).getByText("Added on 2 Nov.")).toBeInTheDocument()
    expect(within(answer).getByText("Not replayed since it was added.")).toBeInTheDocument()

    open("What changed this week")
    expect(screen.queryByText("Added on 2 Nov.")).not.toBeInTheDocument()
  })

  it("a last result that failed says so", () => {
    useEvalStore.setState({
      history: { ...HISTORY, cases: [{ ...HISTORY.cases[1], grades: [{ runId: 8, passed: true }, { runId: 9, passed: false }] }] },
    })
    render(<Improvements slug="acme" />)

    expect(screen.getByRole("img", { name: "qwen3:8b, 7 Nov: failed" })).toBeInTheDocument()
    open("R118 4/6: delete TESTTA-2")
    expect(screen.getByText("failed on 7 Nov")).toBeInTheDocument()
  })

  it("leaves the empty and reading states to the line above it", () => {
    useEvalStore.setState({ history: null, historyFailed: false })
    const { container, rerender } = render(<Improvements slug="acme" />)
    expect(container).toBeEmptyDOMElement()

    useEvalStore.setState({ history: { runs: [], cases: [] }, historyFailed: false })
    rerender(<Improvements slug="acme" />)
    expect(container).toBeEmptyDOMElement()
  })
})
