import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getErrorMessage: vi.fn((e: { message?: string }) => e?.message || "error"),
  getErrorStatus: vi.fn(),
}))

import { listAttachmentCounts } from "./attachment-service"
import { apiClient } from "./client"
import { decideApproval } from "./delivery-service"
import { ISSUES_PAGE_MAX, listIssuesPage } from "./issue-service"
import { clearProjectObjective, getProjectObjective, setProjectObjective } from "./project-service"
import { ATTACHMENT_ROUTES, DELIVERY_ROUTES, ISSUE_ROUTES, PROJECT_ROUTES } from "../config/api-routes"

const envelope = <T,>(data: T) => ({ data: { success: true, message: "ok", data } })

/** Les lectures et les écritures du workflow (séance n°25, W1), par les routes déclarées. */
describe("the workflow's services", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reads a page of the project's issues, 100 at most, in the background", async () => {
    const page = { content: [], pageNumber: 2, pageSize: 100, totalElements: 250, totalPages: 3, first: false, last: true, empty: true }
    vi.mocked(apiClient.get).mockResolvedValue(envelope(page))
    expect(await listIssuesPage("acme", 3, 2)).toEqual(page)
    expect(apiClient.get).toHaveBeenCalledWith(ISSUE_ROUTES.PAGED("acme", 3), { params: { page: 2, size: ISSUES_PAGE_MAX }, silentError: true })
    expect(ISSUE_ROUTES.PAGED("acme", 3)).toBe("/api/workspaces/acme/projects/3/issues/paged")
  })

  it("reads the number of documents of each issue in one call", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope([{ issueId: 1, count: 2 }]))
    expect(await listAttachmentCounts("acme", 3)).toEqual([{ issueId: 1, count: 2 }])
    expect(apiClient.get).toHaveBeenCalledWith("/api/workspaces/acme/projects/3/attachments/counts", { silentError: true })
    vi.mocked(apiClient.get).mockResolvedValue(envelope(null))
    expect(await listAttachmentCounts("acme", 3)).toEqual([])
    expect(ATTACHMENT_ROUTES.COUNTS("acme", 3)).toBe("/api/workspaces/acme/projects/3/attachments/counts")
  })

  it("reads, sets and clears the project's objective", async () => {
    const objective = { goal: "Ship", targetDate: null, criteria: ["CSV"], updatedBy: "Pierre", updatedAt: null, canEdit: true }
    const route = PROJECT_ROUTES.OBJECTIVE("acme", 3)
    expect(route).toBe("/api/workspaces/acme/projects/3/objective")

    vi.mocked(apiClient.get).mockResolvedValue(envelope(objective))
    expect(await getProjectObjective("acme", 3)).toEqual(objective)
    expect(apiClient.get).toHaveBeenCalledWith(route, { silentError: true })

    vi.mocked(apiClient.put).mockResolvedValue(envelope(objective))
    const payload = { goal: "Ship", targetDate: null, criteria: ["CSV"] }
    expect(await setProjectObjective("acme", 3, payload)).toEqual(objective)
    expect(apiClient.put).toHaveBeenCalledWith(route, payload, { silentError: true })

    vi.mocked(apiClient.delete).mockResolvedValue(envelope({ ...objective, goal: null }))
    expect((await clearProjectObjective("acme", 3)).goal).toBeNull()
    expect(apiClient.delete).toHaveBeenCalledWith(route, { silentError: true })
  })

  it("sends the reason of a decision, trimmed, only when there is one", async () => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope(null))
    await decideApproval("acme", 100, 9, true, false, "  Checked the diff ")
    expect(apiClient.post).toHaveBeenCalledWith(DELIVERY_ROUTES.DECIDE("acme", 100, 9), { decision: "ALLOW", reason: "Checked the diff" })
    await decideApproval("acme", 100, 9, false, false, "   ")
    expect(apiClient.post).toHaveBeenLastCalledWith(DELIVERY_ROUTES.DECIDE("acme", 100, 9), { decision: "DENY" })
  })
})
