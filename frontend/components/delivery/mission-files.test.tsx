import { describe, expect, it } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"

import { MissionFiles } from "./mission-files"
import type { DeliveryRunEvent } from "@/lib/api/delivery-service"

const tool = (seq: number, name: string, text: string): DeliveryRunEvent => ({ seq, kind: "tool", tool: name, text, at: null })

const EVENTS = [
  tool(1, "Edit", "src/footer.tsx"),
  tool(2, "Write", "src/links.ts"),
  tool(3, "Edit", "src/links.ts"),
  tool(4, "taskforce: add_comment", '{"issue":"WEB-28","content":"Links fixed."}'),
  tool(5, "taskforce: add_comment", '{"issue":"WEB-28","content":"Also the header."}'),
  tool(6, "taskforce: update_issue", '{"issue":"WEB-28"}'),
]

/** Ce que la chronologie dit des fichiers et des documents, sous la liste des changements (R139). */
describe("MissionFiles", () => {
  it("lists each file once, what happened to it, and counts the comments", () => {
    render(<MissionFiles run={{ resultUrl: null }} events={EVENTS} />)

    const list = screen.getByRole("region", { name: "Files and documents" })
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "src/footer.tsxEdited", "src/links.tsWritten · 2 times", "Commented2 times", "Updated an issue",
    ])
    expect(within(list).queryByRole("link")).toBeNull()
  })

  it("keeps only the documents once the runner reports the files (R139)", () => {
    render(<MissionFiles run={{ resultUrl: null }} events={EVENTS} documentsOnly />)

    const list = screen.getByRole("region", { name: "Files and documents" })
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Commented2 times", "Updated an issue"])
  })

  it("links each file to its diff in the pull request", async () => {
    render(<MissionFiles run={{ resultUrl: "https://github.com/acme/website/pull/212" }} events={EVENTS} />)

    await waitFor(() => expect(screen.getAllByRole("link", { name: "Diff" })[0].getAttribute("href"))
      .toMatch(/^https:\/\/github\.com\/acme\/website\/pull\/212\/files#diff-[0-9a-f]{64}$/))
  })

  it("is not there when the mission hasn't produced anything", () => {
    const { container } = render(<MissionFiles run={{ resultUrl: null }} events={[tool(1, "Read", "a.ts")]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
