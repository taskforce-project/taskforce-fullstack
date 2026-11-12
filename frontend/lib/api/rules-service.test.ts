import { beforeEach, describe, expect, it, vi } from "vitest"
import { AxiosError, type AxiosResponse } from "axios"

import { apiClient } from "./client"
import { addRule, checkAction, draftRule, getRules, removeRule } from "./rules-service"

vi.mock("./client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  AI_TIMEOUT_MS: 200_000,
}))

const envelope = <T>(payload: T) => ({ data: { success: true, message: "ok", data: payload } })
const BASE = "/api/workspaces/acme/rules"
const DRAFT = {
  text: "No change in the accounting module without the approval of the finance lead", scope: "workspace", ref: null,
  rules: [], modelCases: [], cases: [], broken: [], problems: [], approverNeeded: null, unclear: null, passed: true,
}

/** Une réponse 422 de l'API, avec la vérification de la règle refusée. */
function refused(data: unknown): AxiosError {
  const error = new AxiosError("Unprocessable")
  error.response = { status: 422, data: { success: false, message: "refused", data }, statusText: "", headers: {},
    config: {} as AxiosResponse["config"] } as AxiosResponse
  return error
}

describe("rules-service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("reads the rules of the workspace, quietly", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope({ version: 1 }))

    expect(await getRules("acme")).toEqual({ version: 1 })
    expect(apiClient.get).toHaveBeenCalledWith(BASE, { silentError: true })
  })

  it("drafts a rule with the model's time to answer", async () => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope(DRAFT))

    expect(await draftRule("acme", { text: DRAFT.text, scope: "workspace" })).toEqual(DRAFT)
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/drafts`, { text: DRAFT.text, scope: "workspace" }, { timeout: 200_000 })
  })

  it("adds a rule; a refused rule comes back with its check instead of failing", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(envelope(DRAFT))
    expect(await addRule("acme", { text: DRAFT.text, scope: "workspace", rules: [] })).toEqual({ saved: true, draft: DRAFT })

    vi.mocked(apiClient.post).mockRejectedValueOnce(refused({ ...DRAFT, passed: false }))
    expect(await addRule("acme", { text: DRAFT.text, scope: "workspace", rules: [] }))
      .toEqual({ saved: false, draft: { ...DRAFT, passed: false } })
  })

  it("lets any other failure through", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error("network"))
    await expect(addRule("acme", { text: "x", scope: "workspace" })).rejects.toThrow("network")

    vi.mocked(apiClient.post).mockRejectedValueOnce(refused(undefined))
    await expect(addRule("acme", { text: "x", scope: "workspace" })).rejects.toThrow("Unprocessable")
  })

  it("removes a rule from its layer", async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} })

    await removeRule("acme", "project", "12", "prj12-no-change-abc123")
    expect(apiClient.delete).toHaveBeenCalledWith(`${BASE}/prj12-no-change-abc123`, { params: { scope: "project", ref: "12" } })

    await removeRule("acme", "workspace", null, "ws-x")
    expect(apiClient.delete).toHaveBeenLastCalledWith(`${BASE}/ws-x`, { params: { scope: "workspace" } })
  })

  it("asks what would happen to an action", async () => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope({ facts: null, decision: null, unclear: "x" }))

    expect(await checkAction("acme", "Send an email", 12)).toEqual({ facts: null, decision: null, unclear: "x" })
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/check`, { text: "Send an email", projectId: 12 }, { timeout: 200_000 })
  })
})
