import { beforeEach, describe, expect, it, vi } from "vitest"

import { AI_TIMEOUT_MS, apiClient } from "./client"
import {
  archiveEvalCase, createEvalCase, draftEvalCase, getEvalBank, getEvalRun, runEvalCase, setEvalBankEnabled,
  startEvalRun, NO_TOOL, type EvalCriteria,
} from "./eval-service"

vi.mock("./client", () => ({
  AI_TIMEOUT_MS: 200_000,
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

const envelope = <T>(payload: T) => ({ data: { success: true, message: "ok", data: payload } })
const BASE = "/api/workspaces/acme/evals"
const CRITERIA: EvalCriteria = {
  tool: NO_TOOL, args: {}, effect: "", forbid: ["create_project"], contains: [], notContains: [],
}

describe("eval-service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("reads the bank without a toast (background call)", async () => {
    const bank = { enabled: true, canManage: false, cases: [], runs: [] }
    vi.mocked(apiClient.get).mockResolvedValue(envelope(bank))

    expect(await getEvalBank("acme")).toEqual(bank)
    expect(apiClient.get).toHaveBeenCalledWith(BASE, { silentError: true })
  })

  it("drafts a case from the record of an answer", async () => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope({ record: "r-1" }))

    expect(await draftEvalCase("acme", "r-1")).toEqual({ record: "r-1" })
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/cases/draft`, { record: "r-1" })
  })

  it("adds a case with its title and criteria", async () => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope({ id: 40 }))

    expect(await createEvalCase("acme", "r-1", "Kernel check", CRITERIA)).toEqual({ id: 40 })
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/cases`, { record: "r-1", title: "Kernel check", criteria: CRITERIA })
  })

  it("archives a case", async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(null))

    await archiveEvalCase("acme", 40)

    expect(apiClient.delete).toHaveBeenCalledWith(`${BASE}/cases/40`)
  })

  it("starts a run on a named model", async () => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope({ id: 9, model: "llama3.2" }))

    expect(await startEvalRun("acme", "llama3.2")).toEqual({ id: 9, model: "llama3.2" })
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/runs`, { model: "llama3.2" })
  })

  it("grades a case with the AI delay and no toast", async () => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope({ caseId: 40, passed: true }))

    expect(await runEvalCase("acme", 9, 40)).toEqual({ caseId: 40, passed: true })
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/runs/9/cases/40`, {}, { timeout: AI_TIMEOUT_MS, silentError: true })
  })

  it("reads a run with its grades", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope({ run: { id: 9 }, results: [] }))

    expect(await getEvalRun("acme", 9)).toEqual({ run: { id: 9 }, results: [] })
    expect(apiClient.get).toHaveBeenCalledWith(`${BASE}/runs/9`)
  })

  it("turns the bank off and returns the kept state", async () => {
    vi.mocked(apiClient.put).mockResolvedValue(envelope(false))

    expect(await setEvalBankEnabled("acme", false)).toBe(false)
    expect(apiClient.put).toHaveBeenCalledWith(`${BASE}/settings`, { enabled: false })
  })
})
