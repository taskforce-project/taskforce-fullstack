import { beforeEach, describe, expect, it, vi } from "vitest"
import { AxiosError, type AxiosResponse } from "axios"

import { apiClient } from "./client"
import {
  checkProcess,
  exportDefaultBpmn,
  exportProcessBpmn,
  fileNameOf,
  getProcess,
  getProcessVersion,
  importProcessBpmn,
  listProcessDefaults,
  listProcesses,
  publishProcess,
  type ProcessModel,
} from "./process-service"

vi.mock("./client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}))

const envelope = <T>(payload: T) => ({ data: { success: true, message: "ok", data: payload } })
const BASE = "/api/workspaces/acme/projects/12/processes"
const MODEL: ProcessModel = { format: "taskforce-process/1", key: "integrate-a-module", name: "Integrate a module" }
const VERSION = {
  key: "integrate-a-module", version: 2, name: "Integrate a module", digest: "sha256:abc", author: "Pierre",
  publishedAt: "2026-11-14T10:00:00", derivedFrom: "integrate-a-module", model: MODEL,
}
const CHECK = {
  passed: false, digest: "sha256:abc",
  problems: [{ code: "noOwner", stepId: "write-scope", step: "Write the scope", message: "“Write the scope” has no one who answers for it: name a person or a role." }],
}

/** Une réponse 422 de l'API, avec les refus du vérificateur. */
function refused(data: unknown): AxiosError {
  const error = new AxiosError("Unprocessable")
  error.response = { status: 422, data: { success: false, message: "refused", data }, statusText: "", headers: {},
    config: {} as AxiosResponse["config"] } as AxiosResponse
  return error
}

describe("process-service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("reads the default workflows and a project's processes, quietly", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope([{ key: "integrate-a-module" }]))
    expect(await listProcessDefaults("acme")).toEqual([{ key: "integrate-a-module" }])
    expect(apiClient.get).toHaveBeenCalledWith("/api/workspaces/acme/processes/defaults", { silentError: true })

    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope({ processes: [], canPublish: true }))
    expect(await listProcesses("acme", 12)).toEqual({ processes: [], canPublish: true })
    expect(apiClient.get).toHaveBeenLastCalledWith(BASE, { silentError: true })
  })

  it("reads a process and one of its versions, by key", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope({ key: "integrate-a-module", current: VERSION, versions: [],
      canPublish: false }))
    expect((await getProcess("acme", 12, "integrate-a-module")).current).toEqual(VERSION)
    expect(apiClient.get).toHaveBeenCalledWith(`${BASE}/integrate-a-module`, { silentError: true })

    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope(VERSION))
    expect(await getProcessVersion("acme", 12, "integrate-a-module", 2)).toEqual(VERSION)
    expect(apiClient.get).toHaveBeenLastCalledWith(`${BASE}/integrate-a-module/versions/2`, { silentError: true })
  })

  it("checks a model and reads a BPMN file, without publishing anything", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(envelope(CHECK))
    expect(await checkProcess("acme", 12, MODEL)).toEqual(CHECK)
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/check`, { model: MODEL })

    const read = { passed: true, digest: "sha256:abc", model: MODEL, problems: [], notes: [] }
    vi.mocked(apiClient.post).mockResolvedValueOnce(envelope(read))
    expect(await importProcessBpmn("acme", 12, "<bpmn:definitions/>")).toEqual(read)
    expect(apiClient.post).toHaveBeenLastCalledWith(`${BASE}/import`, { xml: "<bpmn:definitions/>" })
  })

  it("publishes a version; a refused one comes back with its refusals instead of failing", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(envelope({ version: VERSION, refused: null }))
    expect(await publishProcess("acme", 12, MODEL)).toEqual({ published: true, version: VERSION })
    expect(apiClient.post).toHaveBeenCalledWith(BASE, { model: MODEL })

    vi.mocked(apiClient.post).mockRejectedValueOnce(refused({ version: null, refused: CHECK }))
    expect(await publishProcess("acme", 12, MODEL)).toEqual({ published: false, check: CHECK })
  })

  it("lets any other failure through", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error("network"))
    await expect(publishProcess("acme", 12, MODEL)).rejects.toThrow("network")

    vi.mocked(apiClient.post).mockRejectedValueOnce(refused(undefined))
    await expect(publishProcess("acme", 12, MODEL)).rejects.toThrow("Unprocessable")

    vi.mocked(apiClient.post).mockResolvedValueOnce(envelope({ version: null, refused: null }))
    await expect(publishProcess("acme", 12, MODEL)).rejects.toThrow("The server published nothing.")
  })

  it("downloads a version, or a default workflow, as a BPMN file named by the server", async () => {
    const blob = new Blob(["<xml/>"])
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: blob,
      headers: { "content-disposition": "attachment; filename=\"integrate-a-module-v2.bpmn\"" } })
    expect(await exportProcessBpmn("acme", 12, "integrate-a-module", 2))
      .toEqual({ fileName: "integrate-a-module-v2.bpmn", blob })
    expect(apiClient.get).toHaveBeenCalledWith(`${BASE}/integrate-a-module/versions/2/bpmn`,
      { responseType: "blob", silentError: true })

    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: blob, headers: {} })
    expect(await exportDefaultBpmn("acme", "integrate-a-module"))
      .toEqual({ fileName: "integrate-a-module.bpmn", blob })
    expect(apiClient.get).toHaveBeenLastCalledWith("/api/workspaces/acme/processes/defaults/integrate-a-module/bpmn",
      { responseType: "blob", silentError: true })
  })

  it("reads the file name of a download", () => {
    expect(fileNameOf("attachment; filename=\"a.bpmn\"")).toBe("a.bpmn")
    expect(fileNameOf("attachment; filename*=UTF-8''b%20c.bpmn")).toBe("b c.bpmn")
    expect(fileNameOf("attachment")).toBeNull()
    expect(fileNameOf(undefined)).toBeNull()
  })
})
