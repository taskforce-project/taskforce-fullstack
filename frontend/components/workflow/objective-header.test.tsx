import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/api/project-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/project-service")>()),
  setProjectObjective: vi.fn(),
  clearProjectObjective: vi.fn(),
}))

import { ObjectiveHeader, todayMark } from "./objective-header"
import { objectivePayload } from "./objective-dialog"
import { clearProjectObjective, setProjectObjective, type ProjectObjective } from "@/lib/api/project-service"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { useProjectStore } from "@/lib/store/project-store"

const t = CONSTANTS_EN.workflow
const now = new Date(2026, 10, 13, 12, 0)
const none: ProjectObjective = { goal: null, targetDate: null, criteria: [], updatedBy: null, updatedAt: null, canEdit: true }
const set: ProjectObjective = {
  goal: "Ship the export to the first client", targetDate: "2026-12-19", criteria: ["CSV opens in Excel", "No row lost"],
  updatedBy: "Pierre", updatedAt: "2026-11-13T10:00:00", canEdit: true,
}
const counts = { needsYou: 2, blocked: 1, missing: 0, failed: 1 }

function header(objective: ProjectObjective | undefined, onFilter = vi.fn(), filter: "needs-you" | null = null) {
  return render(
    <ObjectiveHeader slug="acme" projectId={3} objective={objective} projectStart="2026-11-01T09:00:00" counts={counts}
      done={14} total={31} filter={filter} onFilter={onFilter} now={now} narrow={false} t={t} />,
  )
}

/** L'en-tête de l'objectif (séance n°25, §3) : la première lecture du dirigeant. */
describe("ObjectiveHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProjectStore.setState({ objectives: {}, objectiveError: null })
  })

  it("without an objective, says so, and offers to write one to who may", () => {
    const { unmount } = header(none)
    expect(screen.getByText("This project has no objective yet.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add an objective" })).toBeInTheDocument()
    expect(screen.getByText("14 of 31 done")).toBeInTheDocument()
    unmount()
    header({ ...none, canEdit: false })
    expect(screen.queryByRole("button", { name: "Add an objective" })).toBeNull()
  })

  it("a read that failed says so and offers to read again, never « no objective yet »", () => {
    const onRetry = vi.fn()
    render(
      <ObjectiveHeader slug="acme" projectId={3} objective={undefined} readFailed onRetry={onRetry} projectStart="2026-11-01T09:00:00"
        counts={counts} done={14} total={31} filter={null} onFilter={vi.fn()} now={now} narrow={false} t={t} />,
    )
    expect(screen.getByText("Couldn't load the objective.")).toBeInTheDocument()
    expect(screen.queryByText("This project has no objective yet.")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(onRetry).toHaveBeenCalled()
  })

  it("with one: the goal, the target date, done of total, the criteria a click away; the counters are filters", () => {
    const onFilter = vi.fn()
    header(set, onFilter)
    expect(screen.getByText("Ship the export to the first client")).toHaveAttribute("title", "Ship the export to the first client")
    expect(screen.getByText("Target 19 Dec")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "2 success criteria" }))
    expect(screen.getByText("No row lost")).toBeInTheDocument()

    expect(screen.queryByRole("button", { name: /^Missing/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Needs you 2" }))
    expect(onFilter).toHaveBeenCalledWith("needs-you")
    // L'avance se lit à la forme : la part faite, et le trait d'aujourd'hui sur toute la hauteur, sans pourcentage écrit.
    const line = screen.getByRole("img", { name: /14 of 31 done/ })
    expect(line.children).toHaveLength(1)
    expect(document.querySelector("[data-today]")).not.toBeNull()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it("the criteria open in a named dialog", async () => {
    header(set)
    fireEvent.click(screen.getByRole("button", { name: "2 success criteria" }))
    expect(await screen.findByRole("dialog", { name: "How you'll know it's done" })).toBeInTheDocument()
  })

  it("a counter that is on turns off", () => {
    const onFilter = vi.fn()
    header(set, onFilter, "needs-you")
    const counter = screen.getByRole("button", { name: "Needs you 2" })
    expect(counter).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(counter)
    expect(onFilter).toHaveBeenCalledWith(null)
  })

  it("writes the objective in its 560 px dialog: one sentence, a date, one to five criteria", async () => {
    vi.mocked(setProjectObjective).mockResolvedValue(set)
    header(none)
    fireEvent.click(screen.getByRole("button", { name: "Add an objective" }))
    const dialog = await screen.findByRole("dialog", { name: "What is this project for?" })
    expect(dialog.className).toContain("sm:max-w-[560px]")
    const save = screen.getByRole("button", { name: "Save the objective" })
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByLabelText("Objective, in one sentence"), { target: { value: "  Ship the export  " } })
    fireEvent.change(screen.getByLabelText("Target date"), { target: { value: "2026-12-19" } })
    fireEvent.change(screen.getByLabelText("Criterion 1"), { target: { value: "CSV opens in Excel" } })
    fireEvent.click(screen.getByRole("button", { name: "Add a criterion" }))
    fireEvent.change(screen.getByLabelText("Criterion 2"), { target: { value: "   " } })
    fireEvent.click(save)

    await waitFor(() => expect(setProjectObjective).toHaveBeenCalledWith("acme", 3, {
      goal: "Ship the export", targetDate: "2026-12-19", criteria: ["CSV opens in Excel"],
    }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("says why the server refused, in the dialog", async () => {
    const refused = Object.assign(new Error("403"), {
      isAxiosError: true, response: { status: 403, data: { message: "Only the project's lead or a workspace admin can change its objective." } },
    })
    vi.mocked(setProjectObjective).mockRejectedValue(refused)
    header(set)
    fireEvent.click(screen.getByRole("button", { name: "Change the objective" }))
    fireEvent.click(await screen.findByRole("button", { name: "Save the objective" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Only the project's lead or a workspace admin can change its objective.")
  })

  it("removes the objective", async () => {
    vi.mocked(clearProjectObjective).mockResolvedValue(none)
    header(set)
    fireEvent.click(screen.getByRole("button", { name: "Change the objective" }))
    fireEvent.click(await screen.findByRole("button", { name: "Remove the objective" }))
    await waitFor(() => expect(clearProjectObjective).toHaveBeenCalledWith("acme", 3))
  })
})

describe("the objective's words and line", () => {
  it("what the dialog sends, and when it can't", () => {
    expect(objectivePayload("", "", ["a"])).toBeNull()
    expect(objectivePayload("Goal", "", [" ", ""])).toBeNull()
    expect(objectivePayload("Goal", "", ["a", "b", "c", "d", "e", "f"])).toBeNull()
    expect(objectivePayload("Goal", "", ["x".repeat(201)])).toBeNull()
    expect(objectivePayload(" Goal ", "", [" a "])).toEqual({ goal: "Goal", targetDate: null, criteria: ["a"] })
  })

  it("draws today the full height of the header, « Today » on hover, and the share done on 4 px", () => {
    header(set)
    const today = document.querySelector<HTMLElement>("[data-today]")
    expect(today).toHaveAttribute("title", "Today")
    expect(today?.className).toContain("inset-y-0")
    expect(document.querySelector("[data-progress]")?.className).toContain("h-1")
  })

  it("today between the start and the target date, only with a date ahead", () => {
    expect(todayMark("2026-11-01T00:00:00", "2026-12-01", new Date(2026, 10, 16))).toBeCloseTo(0.5, 1)
    expect(todayMark("2026-11-01T00:00:00", "2026-12-01", new Date(2027, 0, 1))).toBe(1)
    expect(todayMark("2026-11-01T00:00:00", null, now)).toBeNull()
    expect(todayMark("2026-11-01T00:00:00", "2026-10-01", now)).toBeNull()
  })
})
