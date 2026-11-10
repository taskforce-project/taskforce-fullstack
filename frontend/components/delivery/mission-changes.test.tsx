import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({ openMission: vi.fn() }))
const toaster = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("next/navigation", () => ({ useParams: () => ({ workspace: "acme" }) }))
vi.mock("@/lib/hooks/use-pane-navigation", () => ({ usePaneNavigation: () => ({ openMission: nav.openMission }) }))
vi.mock("sonner", () => ({ toast: toaster }))

import { MissionChanges } from "./mission-changes"
import type { DeliveryRun, MissionChanges as Changes, MissionFileChange, MissionFileDiff } from "@/lib/api/delivery-service"
import { useDeliveryStore } from "@/lib/store/delivery-store"

const RUN: DeliveryRun = {
  id: 100, issueId: 28, issueKey: "WEB-28", issueTitle: "Fix the footer", projectId: 3, projectName: "Website",
  providerKey: "claude-code", model: null, status: "DONE", summary: "done", resultUrl: null, error: null, startedById: 7,
  createdAt: null, updatedAt: null,
}

const file = (over: Partial<MissionFileChange> = {}): MissionFileChange => ({
  path: "src/footer.tsx", status: "modified", added: 12, removed: 1, binary: false, truncated: false, withheld: false,
  revision: "r1", reverting: false, error: null, updatedAt: null, ...over,
})

const changes = (over: Partial<Changes> = {}): Changes => ({
  mode: "repo", live: false, added: 12, removed: 1, more: 0, files: [file()], canRevert: true, canComment: true, canCorrect: false,
  blockedReason: null, correction: null, ...over,
})

const DIFF: MissionFileDiff = {
  path: "src/footer.tsx", format: "diff", body: "@@ -1,2 +1,2 @@\n keep\n-old line\n+new line", binary: false, truncated: false, withheld: false, revision: "r1",
}

let fetchMissionChanges: ReturnType<typeof vi.fn>
let fetchFileDiff: ReturnType<typeof vi.fn>
let revertFile: ReturnType<typeof vi.fn>
let askForChanges: ReturnType<typeof vi.fn>
let sendCorrection: ReturnType<typeof vi.fn>

function seed(value: Changes | undefined, diff: MissionFileDiff | null | "pending" = DIFF) {
  fetchMissionChanges = vi.fn().mockResolvedValue(value ?? null)
  fetchFileDiff = vi.fn().mockImplementation(async () => {
    if (diff === "pending") return null
    useDeliveryStore.setState({ fileDiffs: { 100: { "src/footer.tsx": diff } } })
    return diff
  })
  revertFile = vi.fn().mockResolvedValue(true)
  askForChanges = vi.fn().mockResolvedValue({ ...RUN, id: 101 })
  sendCorrection = vi.fn().mockResolvedValue(true)
  useDeliveryStore.setState({
    missionChanges: value ? { 100: value } : {},
    fileDiffs: {}, changeComments: {}, changeErrors: {},
    fetchMissionChanges, fetchFileDiff, revertFile, askForChanges, sendCorrection,
  } as never)
}

const openRow = (name = /Open the changes of src\/footer.tsx/) => fireEvent.click(screen.getByRole("button", { name }))

describe("MissionChanges", () => {
  const initial = useDeliveryStore.getState()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Le composant part d'abord : le store d'origine ferait de vrais appels depuis un composant encore monté.
    cleanup()
    vi.useRealTimers()
    useDeliveryStore.setState(initial, true)
  })

  it("shows nothing when the runner reported nothing (R15): an older runner, another agent", () => {
    seed(changes({ mode: null, files: [] }))
    const { container } = render(<MissionChanges run={RUN} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows nothing before the first read", () => {
    seed(undefined)
    const { container } = render(<MissionChanges run={RUN} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows each file with its lines added and removed, the name first, and the totals", () => {
    seed(changes({ files: [file(), file({ path: "README.md", added: 3, removed: 0, status: "added" })], added: 15, removed: 1 }))
    render(<MissionChanges run={RUN} />)
    const list = screen.getByRole("list", { name: "Changes" })
    expect(within(list).getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByText("footer.tsx")).toBeInTheDocument()
    expect(screen.getByText("src/")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "12 added, 1 removed" })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "15 added, 1 removed" })).toBeInTheDocument()
    expect(screen.getByText("2 files")).toBeInTheDocument()
    expect(screen.getByText("+15")).toBeInTheDocument()
    expect(screen.getAllByText("−1", { selector: "span.text-chart-2" })).toHaveLength(2)
  })

  it("says one file, and how many more past the cap", () => {
    seed(changes({ more: 0 }))
    const { unmount } = render(<MissionChanges run={RUN} />)
    expect(screen.getByText("1 file")).toBeInTheDocument()
    unmount()
    seed(changes({ more: 4 }))
    render(<MissionChanges run={RUN} />)
    expect(screen.getByText("and 4 more files")).toBeInTheDocument()
    expect(screen.getByText("5 files")).toBeInTheDocument()
  })

  it("says when nothing changed yet, and when nothing changed at all", () => {
    seed(changes({ files: [], live: true }))
    const { unmount } = render(<MissionChanges run={{ ...RUN, status: "RUNNING" }} />)
    expect(screen.getByText("No file changed yet.")).toBeInTheDocument()
    unmount()
    seed(changes({ files: [] }))
    render(<MissionChanges run={RUN} />)
    expect(screen.getByText("This mission didn't change any file.")).toBeInTheDocument()
  })

  it("rereads while the agent works, and stops once it is done", async () => {
    vi.useFakeTimers()
    seed(changes({ live: true }))
    const { rerender } = render(<MissionChanges run={{ ...RUN, status: "RUNNING" }} />)
    expect(fetchMissionChanges).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(4_100) })
    expect(fetchMissionChanges).toHaveBeenCalledTimes(3)
    rerender(<MissionChanges run={RUN} />)
    const after = fetchMissionChanges.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000) })
    expect(fetchMissionChanges.mock.calls.length).toBe(after)
  })

  it("keeps rereading while a file goes back, even though the mission is over", async () => {
    vi.useFakeTimers()
    seed(changes({ files: [file({ reverting: true })] }))
    render(<MissionChanges run={RUN} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(2_100) })
    expect(fetchMissionChanges).toHaveBeenCalledTimes(2)
    expect(screen.getByRole("status")).toHaveTextContent("Putting it back")
  })

  it("opens the diff inline, with the numbers of each side, and closes it", async () => {
    seed(changes())
    render(<MissionChanges run={RUN} />)
    openRow()
    await screen.findByText("new line")
    expect(screen.getByText("old line")).toBeInTheDocument()
    expect(fetchFileDiff).toHaveBeenCalledWith("acme", 100, "src/footer.tsx")
    expect(screen.getByRole("button", { name: /Close the changes/ })).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(screen.getByRole("button", { name: /Close the changes/ }))
    expect(screen.queryByText("new line")).toBeNull()
  })

  it("rereads an open diff when the file changes", async () => {
    seed(changes({ live: true }))
    const { rerender } = render(<MissionChanges run={RUN} />)
    openRow()
    await screen.findByText("new line")
    expect(fetchFileDiff).toHaveBeenCalledTimes(1)
    act(() => useDeliveryStore.setState({ missionChanges: { 100: changes({ files: [file({ revision: "r2" })] }) } }))
    rerender(<MissionChanges run={RUN} />)
    await waitFor(() => expect(fetchFileDiff).toHaveBeenCalledTimes(2))
  })

  it.each([
    ["a binary file", file({ binary: true, added: null, removed: null }), "This file isn't text, so there is nothing to show line by line."],
    ["a file that may hold secrets", file({ withheld: true }), "This file may hold secrets, so its text stays on your computer."],
  ])("says why %s has no diff, without fetching it", (_label, row, words) => {
    seed(changes({ files: [row] }))
    render(<MissionChanges run={RUN} />)
    openRow()
    expect(screen.getByText(words)).toBeInTheDocument()
    expect(fetchFileDiff).not.toHaveBeenCalled()
  })

  it("says 'Not text' instead of counts for a binary file", () => {
    seed(changes({ files: [file({ binary: true, added: null, removed: null })] }))
    render(<MissionChanges run={RUN} />)
    expect(screen.getByText("Not text")).toBeInTheDocument()
  })

  it("says when a diff can't be read, and tries again", async () => {
    seed(changes(), null)
    render(<MissionChanges run={RUN} />)
    openRow()
    await screen.findByText(/couldn't read this file's changes/)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(fetchFileDiff).toHaveBeenCalledTimes(2)
  })

  it("says the diff is being read until it arrives", async () => {
    seed(changes(), "pending")
    render(<MissionChanges run={RUN} />)
    openRow()
    expect(await screen.findByRole("status")).toHaveTextContent("Reading this file")
  })

  it.each([
    ["a diff cut for length", { ...DIFF, truncated: true }, "This file is too long to show in full."],
    ["no text at all", { ...DIFF, body: null, truncated: true }, "This file is too long to show in full."],
    ["only a mode change", { ...DIFF, body: "" }, "No line changed: only this file's permissions did."],
  ])("handles %s", async (_label, diff, words) => {
    seed(changes(), diff)
    render(<MissionChanges run={RUN} />)
    openRow()
    expect(await screen.findByText(words)).toBeInTheDocument()
  })

  it("shows a scratch file as written, with its content and nothing to revert or comment", async () => {
    seed(changes({
      mode: "scratch", canRevert: false, canComment: false, files: [file({ status: "written", added: 3, removed: 0 })],
    }), { ...DIFF, format: "text", body: "# Plan\nLine\n" })
    render(<MissionChanges run={RUN} />)
    expect(screen.getByText(/Written/)).toBeInTheDocument()
    expect(screen.getByText("+3")).toBeInTheDocument()
    openRow()
    expect(await screen.findByText("# Plan")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Put this file back/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Comment on this line" })).toBeNull()
  })

  it("puts a file back after a confirmation that says what will happen", async () => {
    seed(changes())
    render(<MissionChanges run={RUN} />)
    fireEvent.click(screen.getByRole("button", { name: "Put this file back as it was: src/footer.tsx" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Put footer.tsx back as it was?")).toBeInTheDocument()
    expect(within(dialog).getByText(/Nothing else moves/)).toBeInTheDocument()
    expect(revertFile).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole("button", { name: "Put it back" }))
    expect(revertFile).toHaveBeenCalledWith("acme", 100, "src/footer.tsx")
  })

  it("cancelling changes nothing", async () => {
    seed(changes())
    render(<MissionChanges run={RUN} />)
    fireEvent.click(screen.getByRole("button", { name: /Put this file back/ }))
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }))
    expect(revertFile).not.toHaveBeenCalled()
  })

  it.each([
    ["added", "The agent created this file"],
    ["deleted", "The agent deleted this file"],
  ] as const)("says what putting back means for a file the agent %s", async (status, words) => {
    seed(changes({ files: [file({ status })] }))
    render(<MissionChanges run={RUN} />)
    fireEvent.click(screen.getByRole("button", { name: /Put this file back/ }))
    expect(within(await screen.findByRole("alertdialog")).getByText(new RegExp(words))).toBeInTheDocument()
  })

  it("says when a file is back: its row leaves the list", () => {
    seed(changes({ files: [file({ reverting: true })] }))
    render(<MissionChanges run={RUN} />)
    expect(toaster.success).not.toHaveBeenCalled()
    act(() => useDeliveryStore.setState({ missionChanges: { 100: changes({ files: [] }) } }))
    expect(toaster.success).toHaveBeenCalledWith("footer.tsx is back as it was")
  })

  it("does not offer to put a file back when it can't be done (R15), and says why when the person can act", () => {
    seed(changes({ canRevert: false, canComment: false, blockedReason: "Open TaskForce on the computer that ran this mission." }))
    render(<MissionChanges run={RUN} />)
    expect(screen.queryByRole("button", { name: /Put this file back/ })).toBeNull()
    expect(screen.getByText("Open TaskForce on the computer that ran this mission.")).toBeInTheDocument()
  })

  it("shows why putting a file back failed, on its row", () => {
    seed(changes({ files: [file({ error: "TaskForce didn't put this file back: its pull request couldn't be updated." })] }))
    render(<MissionChanges run={RUN} />)
    expect(screen.getByRole("alert")).toHaveTextContent("its pull request couldn't be updated")
  })

  it("shows a refusal from the server on the row too", () => {
    seed(changes())
    act(() => useDeliveryStore.setState({ changeErrors: { 100: { "src/footer.tsx": "Refused." } } }))
    render(<MissionChanges run={RUN} />)
    expect(screen.getByRole("alert")).toHaveTextContent("Refused.")
  })

  it("a failure with no reason says what to do in its own words (R133)", () => {
    seed(changes())
    act(() => useDeliveryStore.setState({
      changeErrors: { 100: { "src/footer.tsx": "", "": "" } },
      changeComments: { 100: [{ id: "c1", path: "src/footer.tsx", side: "new", line: 2, text: "x" }] },
    }))
    render(<MissionChanges run={RUN} />)
    const alerts = screen.getAllByRole("alert").map((a) => a.textContent)
    expect(alerts).toEqual(["TaskForce couldn't put this file back. Try again in a moment.", "TaskForce couldn't send your comments. Try again in a moment."])
  })

  const commentOnNewLine = async () => {
    openRow()
    await screen.findByText("new line")
    const buttons = screen.getAllByRole("button", { name: "Comment on this line" })
    fireEvent.click(buttons[2] as HTMLElement)
    return screen.findByRole("textbox", { name: "What should change here?" })
  }

  it("collects comments on lines and sends them together, then opens the mission that answers", async () => {
    seed(changes())
    useDeliveryStore.setState({ addChangeComment: initial.addChangeComment, removeChangeComment: initial.removeChangeComment } as never)
    render(<MissionChanges run={RUN} />)
    const box = await commentOnNewLine()
    fireEvent.change(box, { target: { value: "Use the helper" } })
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }))

    expect(await screen.findByText("Use the helper")).toBeInTheDocument()
    expect(screen.getByText("1 comment")).toBeInTheDocument()
    expect(useDeliveryStore.getState().changeComments[100]?.[0]).toMatchObject({ path: "src/footer.tsx", side: "new", line: 2, text: "Use the helper" })

    fireEvent.click(screen.getByRole("button", { name: "Ask for changes" }))
    await waitFor(() => expect(askForChanges).toHaveBeenCalledWith("acme", 28, 100))
    await waitFor(() => expect(nav.openMission).toHaveBeenCalledWith(101))
    expect(toaster.success).toHaveBeenCalledWith("The agent is on it")
  })

  it("marks a comment on a removed line with its line number from before", async () => {
    seed(changes())
    useDeliveryStore.setState({ addChangeComment: initial.addChangeComment } as never)
    render(<MissionChanges run={RUN} />)
    openRow()
    await screen.findByText("old line")
    fireEvent.click(screen.getAllByRole("button", { name: "Comment on this line" })[1] as HTMLElement)
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Why?" } })
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }))
    expect(useDeliveryStore.getState().changeComments[100]?.[0]).toMatchObject({ side: "old", line: 2 })
  })

  it("removes a comment before sending", async () => {
    seed(changes())
    useDeliveryStore.setState({ removeChangeComment: initial.removeChangeComment } as never)
    act(() => useDeliveryStore.setState({ changeComments: { 100: [{ id: "c1", path: "src/footer.tsx", side: "new", line: 2, text: "Use the helper" }] } }))
    render(<MissionChanges run={RUN} />)
    openRow()
    await screen.findByText("Use the helper")
    fireEvent.click(screen.getByRole("button", { name: "Remove this comment" }))
    expect(useDeliveryStore.getState().changeComments[100]).toEqual([])
    expect(screen.queryByRole("button", { name: "Ask for changes" })).toBeNull()
  })

  it("won't add an empty comment; Escape and Cancel close the form", async () => {
    seed(changes())
    render(<MissionChanges run={RUN} />)
    const box = await commentOnNewLine()
    expect(screen.getByRole("button", { name: "Add comment" })).toBeDisabled()
    fireEvent.keyDown(box, { key: "Escape" })
    expect(screen.queryByRole("textbox")).toBeNull()
    fireEvent.click(screen.getAllByRole("button", { name: "Comment on this line" })[0] as HTMLElement)
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("Ctrl+Enter adds the comment", async () => {
    seed(changes())
    useDeliveryStore.setState({ addChangeComment: initial.addChangeComment } as never)
    render(<MissionChanges run={RUN} />)
    const box = await commentOnNewLine()
    fireEvent.change(box, { target: { value: "Quick" } })
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true })
    expect(useDeliveryStore.getState().changeComments[100]).toHaveLength(1)
  })

  it("shows why the comments couldn't be sent, and stays on the mission", async () => {
    seed(changes())
    askForChanges.mockResolvedValue(null)
    act(() => useDeliveryStore.setState({
      changeComments: { 100: [{ id: "c1", path: "src/footer.tsx", side: "new", line: 2, text: "x" }, { id: "c2", path: "src/footer.tsx", side: "new", line: 1, text: "y" }] },
      changeErrors: { 100: { "": "A comment is on a file that is no longer among the mission's changes." } },
    }))
    render(<MissionChanges run={RUN} />)
    expect(screen.getByText("2 comments")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("no longer among the mission's changes")
    fireEvent.click(screen.getByRole("button", { name: "Ask for changes" }))
    await waitFor(() => expect(askForChanges).toHaveBeenCalled())
    expect(nav.openMission).not.toHaveBeenCalled()
  })

  it("has no comment gesture while the agent works (R15)", async () => {
    seed(changes({ live: true, canRevert: false, canComment: false }))
    render(<MissionChanges run={{ ...RUN, status: "RUNNING" }} />)
    openRow()
    await screen.findByText("new line")
    expect(screen.queryByRole("button", { name: "Comment on this line" })).toBeNull()
  })

  describe("a correction while the agent works (R140)", () => {
    const live = (over: Partial<Changes> = {}) => changes({ live: true, canRevert: false, canComment: false, canCorrect: true, ...over })

    it("is offered only when it can reach the agent", () => {
      seed(changes())
      const { unmount } = render(<MissionChanges run={RUN} />)
      expect(screen.queryByRole("textbox", { name: "Tell the agent something while it works" })).toBeNull()
      unmount()
      seed(live())
      render(<MissionChanges run={{ ...RUN, status: "RUNNING" }} />)
      expect(screen.getByRole("textbox", { name: "Tell the agent something while it works" })).toBeInTheDocument()
    })

    it("sends what was typed, and empties the field", async () => {
      seed(live())
      render(<MissionChanges run={{ ...RUN, status: "RUNNING" }} />)
      const box = screen.getByRole("textbox", { name: "Tell the agent something while it works" })
      fireEvent.change(box, { target: { value: " use tabs " } })
      fireEvent.click(screen.getByRole("button", { name: "Send" }))
      await waitFor(() => expect(sendCorrection).toHaveBeenCalledWith("acme", 100, "use tabs"))
      await waitFor(() => expect(box).toHaveValue(""))
    })

    it("won't send an empty line, and keeps the text when it can't be sent", async () => {
      seed(live())
      sendCorrection.mockResolvedValue(false)
      render(<MissionChanges run={{ ...RUN, status: "RUNNING" }} />)
      const box = screen.getByRole("textbox", { name: "Tell the agent something while it works" })
      expect(screen.getByRole("button", { name: "Send" })).toBeDisabled()
      fireEvent.change(box, { target: { value: "x" } })
      fireEvent.click(screen.getByRole("button", { name: "Send" }))
      await waitFor(() => expect(sendCorrection).toHaveBeenCalled())
      expect(box).toHaveValue("x")
    })

    it("says it was sent", () => {
      seed(live({ correction: { id: 1, text: "use tabs", status: "DONE", message: "The agent reads it at its next step." } }))
      render(<MissionChanges run={{ ...RUN, status: "RUNNING" }} />)
      expect(screen.getByText("Sent. The agent reads it at its next step.")).toBeInTheDocument()
    })

    it.each(["FAILED", "EXPIRED"] as const)("says when it didn't reach the agent (%s)", (status) => {
      seed(live({ correction: { id: 1, text: "use tabs", status, message: "The agent had already finished, so it didn't read this correction." } }))
      render(<MissionChanges run={{ ...RUN, status: "RUNNING" }} />)
      expect(screen.getByRole("alert")).toHaveTextContent("already finished")
    })

    it("shows a refusal from the server", () => {
      seed(live())
      act(() => useDeliveryStore.setState({ changeErrors: { 100: { "": "The agent isn't working any more." } } }))
      render(<MissionChanges run={{ ...RUN, status: "RUNNING" }} />)
      expect(screen.getByRole("alert")).toHaveTextContent("isn't working any more")
    })

    it("says what to do when it failed with no reason", () => {
      seed(live())
      act(() => useDeliveryStore.setState({ changeErrors: { 100: { "": "" } } }))
      render(<MissionChanges run={{ ...RUN, status: "RUNNING" }} />)
      expect(screen.getByRole("alert")).toHaveTextContent("TaskForce couldn't send this. Try again in a moment.")
    })
  })
})
