import { beforeEach, describe, expect, it, vi } from "vitest";

import * as service from "../api/process-service";
import { useProcessStore } from "./process-store";

vi.mock("../api/process-service", () => ({
  checkProcess: vi.fn(),
  exportDefaultBpmn: vi.fn(),
  exportProcessBpmn: vi.fn(),
  getProcess: vi.fn(),
  getProcessVersion: vi.fn(),
  importProcessBpmn: vi.fn(),
  listProcessDefaults: vi.fn(),
  listProcesses: vi.fn(),
  publishProcess: vi.fn(),
}));

vi.mock("../api/client", () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "Something went wrong"),
}));

const MODEL = { format: "taskforce-process/1", key: "integrate-a-module", name: "Integrate a module" };
const VERSION = {
  key: "integrate-a-module", version: 1, name: "Integrate a module", digest: "sha256:abc", author: "Pierre",
  publishedAt: "2026-11-14T10:00:00", derivedFrom: null, model: MODEL,
};
const OVERVIEW = {
  processes: [{ key: "integrate-a-module", name: "Integrate a module", version: 1, digest: "sha256:abc", author: "Pierre",
    publishedAt: "2026-11-14T10:00:00", versions: 1 }],
  canPublish: true,
};
const DETAIL = { key: "integrate-a-module", current: VERSION, versions: [], canPublish: true };
const CHECK = { passed: true, digest: "sha256:abc", problems: [] };

describe("useProcessStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProcessStore.setState({ overview: null, project: null, detail: null, defaults: null, loading: false,
      loadFailed: false, error: null });
  });

  it("reads the processes of a project", async () => {
    vi.mocked(service.listProcesses).mockResolvedValue(OVERVIEW);

    expect(await useProcessStore.getState().fetchProcesses("acme", 12)).toEqual(OVERVIEW);
    expect(useProcessStore.getState()).toMatchObject({ overview: OVERVIEW, project: "acme:12", loading: false,
      loadFailed: false });
  });

  it("says when they couldn't be read, and forgets another project's", async () => {
    useProcessStore.setState({ overview: OVERVIEW, project: "acme:7", detail: DETAIL });
    vi.mocked(service.listProcesses).mockRejectedValue(new Error("down"));

    expect(await useProcessStore.getState().fetchProcesses("acme", 12)).toBeNull();
    expect(useProcessStore.getState()).toMatchObject({ overview: null, detail: null, loadFailed: true, error: "down" });
  });

  it("drops an answer for a project the person has left", async () => {
    let answer: (o: typeof OVERVIEW) => void = () => {};
    vi.mocked(service.listProcesses).mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    const first = useProcessStore.getState().fetchProcesses("acme", 12);
    useProcessStore.setState({ project: "acme:13" });
    answer(OVERVIEW);

    expect(await first).toEqual(OVERVIEW);
    expect(useProcessStore.getState().overview).toBeNull();
  });

  it("keeps a failure of a project the person has left to itself", async () => {
    let fail: (e: Error) => void = () => {};
    vi.mocked(service.listProcesses).mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
    const first = useProcessStore.getState().fetchProcesses("acme", 12);
    useProcessStore.setState({ project: "acme:13", loading: false });
    fail(new Error("down"));

    expect(await first).toBeNull();
    expect(useProcessStore.getState()).toMatchObject({ loadFailed: false, error: null });
  });

  it("reads a process, and keeps it for the project it belongs to", async () => {
    useProcessStore.setState({ project: "acme:12" });
    vi.mocked(service.getProcess).mockResolvedValueOnce(DETAIL);
    expect(await useProcessStore.getState().fetchProcess("acme", 12, "integrate-a-module")).toEqual(DETAIL);
    expect(useProcessStore.getState().detail).toEqual(DETAIL);

    vi.mocked(service.getProcess).mockResolvedValueOnce(DETAIL);
    useProcessStore.setState({ detail: null });
    await useProcessStore.getState().fetchProcess("acme", 99, "integrate-a-module");
    expect(useProcessStore.getState().detail).toBeNull();

    vi.mocked(service.getProcess).mockRejectedValueOnce(new Error("Process not found"));
    expect(await useProcessStore.getState().fetchProcess("acme", 12, "gone")).toBeNull();
    expect(useProcessStore.getState().error).toBe("Process not found");
  });

  it("reads a version, or says why not", async () => {
    vi.mocked(service.getProcessVersion).mockResolvedValueOnce(VERSION);
    expect(await useProcessStore.getState().fetchVersion("acme", 12, "integrate-a-module", 1)).toEqual(VERSION);

    vi.mocked(service.getProcessVersion).mockRejectedValueOnce(new Error("This version of the process doesn't exist."));
    expect(await useProcessStore.getState().fetchVersion("acme", 12, "integrate-a-module", 9)).toBeNull();
    expect(useProcessStore.getState().error).toBe("This version of the process doesn't exist.");
  });

  it("reads the default workflows", async () => {
    const defaults = [{ key: "integrate-a-module", name: "Integrate a module", description: null, digest: "sha256:abc",
      model: MODEL }];
    vi.mocked(service.listProcessDefaults).mockResolvedValueOnce(defaults);
    expect(await useProcessStore.getState().fetchDefaults("acme")).toEqual(defaults);
    expect(useProcessStore.getState().defaults).toEqual(defaults);

    vi.mocked(service.listProcessDefaults).mockRejectedValueOnce(new Error("down"));
    expect(await useProcessStore.getState().fetchDefaults("acme")).toBeNull();
    expect(useProcessStore.getState().error).toBe("down");
  });

  it("checks a model and reads a BPMN file, or says why not", async () => {
    vi.mocked(service.checkProcess).mockResolvedValueOnce(CHECK);
    expect(await useProcessStore.getState().checkProcess("acme", 12, MODEL)).toEqual(CHECK);
    vi.mocked(service.checkProcess).mockRejectedValueOnce(new Error("down"));
    expect(await useProcessStore.getState().checkProcess("acme", 12, MODEL)).toBeNull();

    const read = { passed: true, digest: "sha256:abc", model: MODEL, problems: [], notes: [] };
    vi.mocked(service.importProcessBpmn).mockResolvedValueOnce(read);
    expect(await useProcessStore.getState().importBpmn("acme", 12, "<xml/>")).toEqual(read);
    vi.mocked(service.importProcessBpmn).mockRejectedValueOnce(new Error("The file is too large."));
    expect(await useProcessStore.getState().importBpmn("acme", 12, "<xml/>")).toBeNull();
    expect(useProcessStore.getState().error).toBe("The file is too large.");
  });

  it("publishes a version and reads the project again; a refused version changes nothing", async () => {
    useProcessStore.setState({ project: "acme:12", detail: DETAIL });
    vi.mocked(service.listProcesses).mockResolvedValue(OVERVIEW);
    vi.mocked(service.getProcess).mockResolvedValue(DETAIL);
    vi.mocked(service.publishProcess).mockResolvedValueOnce({ published: true, version: VERSION });

    expect(await useProcessStore.getState().publish("acme", 12, MODEL)).toEqual({ published: true, version: VERSION });
    expect(service.listProcesses).toHaveBeenCalledTimes(1);
    expect(service.getProcess).toHaveBeenCalledWith("acme", 12, "integrate-a-module");

    const refused = { published: false as const, check: { passed: false, digest: null, problems: [] } };
    vi.mocked(service.publishProcess).mockResolvedValueOnce(refused);
    expect(await useProcessStore.getState().publish("acme", 12, MODEL)).toEqual(refused);
    expect(service.listProcesses).toHaveBeenCalledTimes(1);

    vi.mocked(service.publishProcess).mockRejectedValueOnce(new Error("Only the project's lead"));
    expect(await useProcessStore.getState().publish("acme", 12, MODEL)).toBeNull();
    expect(useProcessStore.getState().error).toBe("Only the project's lead");
  });

  it("publishes a process that isn't the one opened without reading it again", async () => {
    useProcessStore.setState({ project: "acme:12", detail: null });
    vi.mocked(service.listProcesses).mockResolvedValue(OVERVIEW);
    vi.mocked(service.publishProcess).mockResolvedValueOnce({ published: true, version: VERSION });

    await useProcessStore.getState().publish("acme", 12, MODEL);
    expect(service.getProcess).not.toHaveBeenCalled();
  });

  it("downloads a version or a default workflow, or says why not", async () => {
    const file = { fileName: "integrate-a-module-v1.bpmn", blob: new Blob(["<xml/>"]) };
    vi.mocked(service.exportProcessBpmn).mockResolvedValueOnce(file);
    expect(await useProcessStore.getState().downloadBpmn("acme", "integrate-a-module", { projectId: 12, version: 1 }))
      .toEqual(file);
    expect(service.exportProcessBpmn).toHaveBeenCalledWith("acme", 12, "integrate-a-module", 1);

    vi.mocked(service.exportDefaultBpmn).mockResolvedValueOnce(file);
    expect(await useProcessStore.getState().downloadBpmn("acme", "integrate-a-module")).toEqual(file);

    vi.mocked(service.exportDefaultBpmn).mockRejectedValueOnce(new Error("This default workflow doesn't exist."));
    expect(await useProcessStore.getState().downloadBpmn("acme", "gone")).toBeNull();
    expect(useProcessStore.getState().error).toBe("This default workflow doesn't exist.");
  });
});
