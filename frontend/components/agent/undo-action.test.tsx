import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/lib/api/assistant-service", () => ({ undoAction: vi.fn() }))

import { UndoAction } from "./undo-action"
import { undoAction, type AssistantToolCall } from "@/lib/api/assistant-service"
import { useCortexStore } from "@/lib/store/cortex-store"

const CALL: AssistantToolCall = { name: "create_issue", status: "success", input: null, output: "Created TF-14", record: "rec-1" }

/** « Undo » (R77) : le même geste se défait de la conversation ou de « Changes » (R122), et les deux le disent. */
describe("UndoAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCortexStore.setState({ undos: {} })
  })

  it("undoes once, and every place that shows the gesture says it", async () => {
    vi.mocked(undoAction).mockResolvedValue({ tool: "create_issue", status: "success", output: "TF-14 is gone." })
    render(<><UndoAction slug="acme" call={CALL} /><UndoAction slug="acme" call={{ ...CALL }} /></>)

    fireEvent.click(screen.getAllByRole("button", { name: "Undo" })[0])

    await waitFor(() => expect(screen.getAllByText("Undone. TF-14 is gone.")).toHaveLength(2))
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull()
    expect(undoAction).toHaveBeenCalledTimes(1)
  })

  it("says why the server refuses", async () => {
    vi.mocked(undoAction).mockRejectedValue(new Error("TF-14 has comments now."))
    render(<UndoAction slug="acme" call={CALL} />)

    fireEvent.click(screen.getByRole("button", { name: "Undo" }))

    expect(await screen.findByText("TF-14 has comments now.")).toHaveClass("text-destructive")
  })

  it("waits while it undoes", () => {
    useCortexStore.setState({ undos: { "rec-1:create_issue": { status: "running" } } })
    render(<UndoAction slug="acme" call={CALL} />)
    expect(screen.getByRole("button", { name: "Undoing…" })).toBeDisabled()
  })
})
