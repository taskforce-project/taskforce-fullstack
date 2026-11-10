import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getErrorStatus, getRetryAfterSeconds, isRequestTimeout } from "../api/client";
import * as evals from "../api/eval-service";
import * as capabilities from "../api/model-capability-service";
import * as service from "../api/model-benchmark-service";
import type { BenchmarkLoadResult, BenchmarkMatrix, BenchmarkModelDetail, BlindTrialResult, BlindTrialStarted } from "../api/model-benchmark-service";
import type { ModelCapabilityRow, ModelCapabilityTable } from "../api/model-capability-service";
import { useModelBenchmarkStore } from "./model-benchmark-store";
import { useModelCapabilityStore } from "./model-capability-store";

vi.mock("../api/model-benchmark-service", () => ({
  BANK_TASK: "bank",
  chooseBlindTrial: vi.fn(),
  getBenchmarkDetail: vi.fn(),
  getBenchmarkHistory: vi.fn(),
  getBenchmarkMatrix: vi.fn(),
  loadBenchmarkModel: vi.fn(),
  playBenchmarkCase: vi.fn(),
  playBlindTrialLetter: vi.fn(),
  setBenchmarkVerdict: vi.fn(),
  startBenchmarkRun: vi.fn(),
  startBlindTrial: vi.fn(),
  stopBenchmark: vi.fn(),
}));

vi.mock("../api/model-capability-service", () => ({
  chooseModel: vi.fn(),
  getModelCapabilities: vi.fn(),
  measureModelCase: vi.fn(),
  startModelMeasure: vi.fn(),
}));

vi.mock("../api/eval-service", () => ({
  getEvalBank: vi.fn(),
  getEvalHistory: vi.fn(),
  runEvalCase: vi.fn(),
  startEvalRun: vi.fn(),
}));

vi.mock("../api/client", () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "Something went wrong"),
  getErrorStatus: vi.fn(() => undefined),
  getRetryAfterSeconds: vi.fn(() => null),
  isRequestTimeout: vi.fn(() => false),
}));

const MATRIX = {
  provider: "OLLAMA", current: "qwen3:8b", suiteVersion: 1, cases: 2, tasks: [], models: [],
} as BenchmarkMatrix;
const STARTED = (model: string) => ({ runId: 9, model, startedAt: "2026-11-08T10:00:00", cases: ["a-case", "b-case"] });
const RESULT = (caseKey: string) => ({
  resultId: 1, caseKey, title: "t", passed: true, gradedPassed: true, personPassed: null, judge: null, checks: [], calls: [], answer: "ok",
  durationMs: 1000, at: "2026-11-08T10:00:00", tooSlow: false,
});
const LOADED: BenchmarkLoadResult = { status: "loaded", loadMs: 5000, memoryBytes: 5e9, gpuBytes: 5e9, message: null };
const CAP = (caseKey: string) => ({ caseKey, capability: "tools", passed: true, checks: [], answer: "ok", model: "qwen3:8b", promptTokens: 1, tooSlow: false });
const MEASURE = (model: string) => ({ runId: 11, model, startedAt: "2026-11-08T10:00:00", cases: ["tools-move"] });
const DETAIL = { model: "qwen3:8b", current: true, lastRunAt: null, cases: 2, tasks: [], trials: [] } as BenchmarkModelDetail;
const TRIAL: BlindTrialStarted = { trialId: 4, task: "summarize", issueKey: "OPS-35", letters: ["A", "B"] };
const REQUEST = { projectId: 3, issueId: 40, task: "summarize", models: ["qwen3:8b", "qwen3:14b"] };
const REVEAL: BlindTrialResult = {
  trialId: 4, task: "summarize", issueKey: "OPS-35", chosenLetter: "A", chosenModel: "qwen3:14b", decidedAt: "2026-11-08T10:00:00",
  answers: [{ letter: "A", model: "qwen3:14b", answer: "un", durationMs: 1000, tooSlow: false }, { letter: "B", model: "qwen3:8b", answer: "deux", durationMs: 2000, tooSlow: false }],
};
const INITIAL = { matrix: null, details: {}, progress: null, queue: [], notes: {}, autoMeasured: [], history: null, pickerOpen: false, blind: null, openModel: null, error: null };
const state = () => useModelBenchmarkStore.getState();

const score = (measured: number, tooSlow = 0) => ({
  capability: "tools", passed: measured, measured, total: 2, capable: measured === 2, heldWords: null, measuredAt: null, tooSlow,
});
const capabilityRow = (model: string, measured: number, tooSlow = 0): ModelCapabilityRow => ({
  model, current: false, measuredAt: measured ? "2026-11-05T10:00:00" : null, scores: [score(measured, tooSlow), score(measured, tooSlow)],
});
const TABLE = (current: string, measured: number, tooSlow = 0): ModelCapabilityTable => ({
  provider: "OLLAMA", instanceModel: "qwen3:8b", choice: null, current, suiteVersion: 1, capabilities: [], cases: [], proposals: [], proposed: null,
  models: [capabilityRow("qwen3:8b", measured, tooSlow), capabilityRow("qwen3:14b", 0)],
});

/** Le banc des modèles (R131, R142) : le store tient la file, qui continue quand le composant n'est plus à l'écran. */
describe("useModelBenchmarkStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useModelBenchmarkStore.setState({ ...INITIAL });
    useModelCapabilityStore.setState({ table: null });
    vi.mocked(service.getBenchmarkMatrix).mockResolvedValue(MATRIX);
    vi.mocked(service.getBenchmarkHistory).mockResolvedValue([]);
    vi.mocked(service.loadBenchmarkModel).mockResolvedValue(LOADED);
    vi.mocked(service.stopBenchmark).mockResolvedValue(undefined);
    vi.mocked(capabilities.getModelCapabilities).mockResolvedValue(TABLE("qwen3:8b", 2));
    vi.mocked(capabilities.startModelMeasure).mockImplementation(async (_slug, model) => MEASURE(model));
    vi.mocked(capabilities.measureModelCase).mockImplementation(async (_slug, _run, key) => CAP(key));
    vi.mocked(getRetryAfterSeconds).mockReturnValue(null);
    vi.mocked(getErrorStatus).mockReturnValue(undefined);
    vi.mocked(isRequestTimeout).mockReturnValue(false);
  });

  afterEach(() => vi.useRealTimers());

  it("reads the matrix and keeps it when it can't", async () => {
    expect(await state().fetchMatrix("acme")).toEqual(MATRIX);
    vi.mocked(service.getBenchmarkMatrix).mockRejectedValueOnce(new Error("down"));
    expect(await state().fetchMatrix("acme")).toBeNull();
    expect(state().matrix).toEqual(MATRIX);
  });

  it("reads the runs for History, and keeps them when it can't", async () => {
    const line = { runId: 1, model: "qwen3:8b", startedAt: "2026-11-08T10:00:00", total: 22, measured: 22, passed: 20, tooSlow: 0 };
    vi.mocked(service.getBenchmarkHistory).mockResolvedValueOnce([line]).mockRejectedValueOnce(new Error("down"));
    expect(await state().fetchHistory("acme")).toEqual([line]);
    expect(await state().fetchHistory("acme")).toBeNull();
    expect(state().history).toEqual([line]);
  });

  it("keeps the open row, for when the person comes back to the tab", () => {
    state().setOpenModel("qwen3:8b");
    expect(state().openModel).toBe("qwen3:8b");
    state().setOpenModel(null);
    expect(state().openModel).toBeNull();
  });

  it("opens the choice of models for another tab", () => {
    state().setPickerOpen(true);
    expect(state().pickerOpen).toBe(true);
  });

  it("reads a model's detail, by model, and returns null when it can't", async () => {
    vi.mocked(service.getBenchmarkDetail).mockResolvedValueOnce(DETAIL).mockRejectedValueOnce(new Error("down"));
    expect(await state().fetchDetail("acme", "qwen3:8b")).toEqual(DETAIL);
    expect(state().details["qwen3:8b"]).toEqual(DETAIL);
    expect(await state().fetchDetail("acme", "qwen3:8b")).toBeNull();
    expect(state().details["qwen3:8b"]).toEqual(DETAIL);
  });

  it("passes the models one after the other: loaded first, then its capabilities, then its cases; the matrix read as it goes", async () => {
    useModelBenchmarkStore.setState({ matrix: MATRIX });
    const calls: string[] = [];
    vi.mocked(service.startBenchmarkRun).mockImplementation(async (_slug, model) => { calls.push(`start ${model}`); return STARTED(model); });
    vi.mocked(service.loadBenchmarkModel).mockImplementation(async () => { calls.push("load"); return LOADED; });
    vi.mocked(capabilities.measureModelCase).mockImplementation(async (_slug, _run, key) => { calls.push(`cap ${key}`); return CAP(key); });
    vi.mocked(service.playBenchmarkCase).mockImplementation(async (_slug, _run, key) => { calls.push(`case ${key}`); return RESULT(key); });
    const seen: Array<[string, string, number, number]> = [];
    const unsubscribe = useModelBenchmarkStore.subscribe((s) => {
      if (s.progress) seen.push([s.progress.model, s.progress.phase, s.progress.done, s.progress.total]);
    });

    expect(await state().run("acme", ["qwen3:8b", "qwen3:14b"])).toBe(true);
    unsubscribe();

    expect(calls).toEqual([
      "start qwen3:8b", "load", "cap tools-move", "case a-case", "case b-case",
      "start qwen3:14b", "load", "cap tools-move", "case a-case", "case b-case",
    ]);
    expect(seen).toContainEqual(["qwen3:8b", "loading", 0, 0]);
    expect(seen).toContainEqual(["qwen3:14b", "running", 3, 3]);
    expect(state().progress).toBeNull();
    expect(state().queue).toEqual([]);
    expect(capabilities.getModelCapabilities).toHaveBeenCalledWith("acme");
    expect(service.getBenchmarkHistory).toHaveBeenCalledWith("acme");
  });

  it("refreshes an open detail at the end of each model", async () => {
    useModelBenchmarkStore.setState({ matrix: MATRIX, details: { "qwen3:8b": DETAIL } });
    vi.mocked(service.startBenchmarkRun).mockResolvedValue(STARTED("qwen3:8b"));
    vi.mocked(service.playBenchmarkCase).mockImplementation(async (_slug, _run, key) => RESULT(key));
    vi.mocked(service.getBenchmarkDetail).mockResolvedValue(DETAIL);

    await state().run("acme", ["qwen3:8b"]);

    expect(service.getBenchmarkDetail).toHaveBeenCalledWith("acme", "qwen3:8b");
  });

  it("replays the test bank on each model when the workspace has one", async () => {
    useModelBenchmarkStore.setState({ matrix: { ...MATRIX, tasks: [{ key: "bank", label: "Your tests", description: "", cases: 1, trial: false }] } });
    vi.mocked(service.getBenchmarkMatrix).mockResolvedValue({ ...MATRIX, tasks: [{ key: "bank", label: "Your tests", description: "", cases: 1, trial: false }] });
    vi.mocked(service.startBenchmarkRun).mockResolvedValue({ ...STARTED("qwen3:8b"), cases: [] });
    vi.mocked(evals.startEvalRun).mockResolvedValue({ id: 3, model: "qwen3:8b", startedAt: "2026-11-08T10:00:00", finishedAt: null, total: 2, passed: 0 });
    vi.mocked(evals.getEvalBank).mockResolvedValue({
      enabled: true, canManage: true, runs: [],
      cases: [
        { id: 40, title: "before", question: "q", tool: "", createdAt: "2026-11-01T10:00:00", criteriaAt: "2026-11-01T10:00:00", mine: true },
        { id: 41, title: "after", question: "q", tool: "", createdAt: "2026-11-09T10:00:00", criteriaAt: "2026-11-09T10:00:00", mine: true },
      ],
    });
    vi.mocked(evals.runEvalCase).mockResolvedValue({ caseId: 40, title: "before", passed: true, checks: [], calls: [], answer: "ok", model: "qwen3:8b" });

    await state().run("acme", ["qwen3:8b"]);

    expect(evals.startEvalRun).toHaveBeenCalledWith("acme", "qwen3:8b");
    expect(evals.runEvalCase).toHaveBeenCalledTimes(1);
    expect(evals.runEvalCase).toHaveBeenCalledWith("acme", 3, 40);
  });

  it("adds models to the queue while one runs, each once, and the next one is taken in turn", async () => {
    vi.mocked(service.startBenchmarkRun).mockImplementation(async (_slug, model) => STARTED(model));
    let firstCase = true;
    vi.mocked(service.playBenchmarkCase).mockImplementation(async (_slug, _run, key) => {
      if (firstCase) {
        firstCase = false;
        expect(await state().run("acme", ["qwen3:8b", "qwen3:14b"])).toBe(true);
        expect(await state().run("acme", ["qwen3:14b"])).toBe(false);
        expect(state().queue).toEqual([{ model: "qwen3:14b", scope: "everything" }]);
      }
      return RESULT(key);
    });

    await state().run("acme", ["qwen3:8b"]);

    expect(service.startBenchmarkRun).toHaveBeenCalledTimes(2);
    expect(service.startBenchmarkRun).toHaveBeenLastCalledWith("acme", "qwen3:14b");
  });

  it("a model too slow to load, or that can't load, is passed: its row says so, the queue goes on, no error", async () => {
    vi.mocked(service.startBenchmarkRun).mockImplementation(async (_slug, model) => STARTED(model));
    vi.mocked(service.loadBenchmarkModel)
      .mockResolvedValueOnce({ status: "too_slow", loadMs: null, memoryBytes: null, gpuBytes: null, message: null })
      .mockResolvedValueOnce({ status: "failed", loadMs: null, memoryBytes: null, gpuBytes: null, message: null })
      .mockResolvedValueOnce(LOADED);
    vi.mocked(service.playBenchmarkCase).mockImplementation(async (_slug, _run, key) => RESULT(key));

    expect(await state().run("acme", ["a", "b", "c"])).toBe(true);

    expect(service.loadBenchmarkModel).toHaveBeenCalledTimes(3);
    expect(service.playBenchmarkCase).toHaveBeenCalledTimes(2);
    expect(state().error).toBeNull();
  });

  it("an AI that no longer answers stops the queue and says what to do", async () => {
    vi.mocked(service.startBenchmarkRun).mockImplementation(async (_slug, model) => STARTED(model));
    vi.mocked(service.loadBenchmarkModel).mockResolvedValue({ status: "unreachable", loadMs: null, memoryBytes: null, gpuBytes: null, message: "Check that it is running." });

    expect(await state().run("acme", ["a", "b"])).toBe(false);

    expect(state().error).toBe("Check that it is running.");
    expect(state().progress).toBeNull();
    expect(service.startBenchmarkRun).toHaveBeenCalledTimes(1);
  });

  it("a model that stops answering gets its reason on its row, and the next one goes on", async () => {
    vi.mocked(service.startBenchmarkRun).mockImplementation(async (_slug, model) => STARTED(model));
    vi.mocked(service.playBenchmarkCase).mockImplementation(async (_slug, _run, key) => RESULT(key));
    vi.mocked(capabilities.startModelMeasure).mockRejectedValueOnce(new Error("a stopped answering")).mockImplementation(async (_slug, model) => MEASURE(model));
    vi.mocked(getErrorStatus).mockReturnValue(400);

    expect(await state().run("acme", ["a", "b"])).toBe(true);

    expect(state().notes).toEqual({ a: "a stopped answering" });
    expect(state().error).toBeNull();
    expect(service.playBenchmarkCase).toHaveBeenCalledTimes(2);
  });

  it("running a model again clears its old reason", async () => {
    useModelBenchmarkStore.setState({ notes: { a: "old reason", b: "kept" } });
    vi.mocked(service.startBenchmarkRun).mockImplementation(async (_slug, model) => STARTED(model));
    vi.mocked(service.playBenchmarkCase).mockImplementation(async (_slug, _run, key) => RESULT(key));

    await state().run("acme", ["a"]);

    expect(state().notes).toEqual({ b: "kept" });
  });

  it("any other failure (a quota reached) stops the queue and says it", async () => {
    vi.mocked(service.startBenchmarkRun).mockResolvedValue(STARTED("a"));
    vi.mocked(service.playBenchmarkCase).mockRejectedValue(new Error("Your AI quota is reached"));
    vi.mocked(getErrorStatus).mockReturnValue(409);

    expect(await state().run("acme", ["a", "b"])).toBe(false);

    expect(state().error).toBe("Your AI quota is reached");
    expect(service.startBenchmarkRun).toHaveBeenCalledTimes(1);
    expect(state().progress).toBeNull();
  });

  it.each([[undefined], [500]])("a server that doesn't answer (%s) never says an internal message: what happened, and what to do", async (status) => {
    vi.mocked(service.startBenchmarkRun).mockRejectedValue(new Error("An unexpected error occurred. Please try again later."));
    vi.mocked(getErrorStatus).mockReturnValue(status);

    expect(await state().run("acme", ["a"])).toBe(false);

    expect(state().error).toBe("The run stopped: TaskForce lost its connection to the server. Run the models again.");
  });

  it("a request that a proxy cut leaves its case unmarked, and goes on", async () => {
    vi.mocked(service.startBenchmarkRun).mockResolvedValue(STARTED("a"));
    vi.mocked(service.playBenchmarkCase).mockRejectedValueOnce(new Error("timeout")).mockImplementation(async (_slug, _run, key) => RESULT(key));
    vi.mocked(isRequestTimeout).mockReturnValueOnce(true);

    expect(await state().run("acme", ["a"])).toBe(true);

    expect(service.playBenchmarkCase).toHaveBeenCalledTimes(2);
    expect(state().error).toBeNull();
  });

  it("Stop cuts the case under way, empties the queue, and is not an error", async () => {
    vi.mocked(service.startBenchmarkRun).mockImplementation(async (_slug, model) => STARTED(model));
    vi.mocked(service.playBenchmarkCase).mockImplementation(async () => {
      state().stop("acme");
      throw new Error("Stopped.");
    });
    vi.mocked(getErrorStatus).mockReturnValue(400);

    expect(await state().run("acme", ["a", "b"])).toBe(true);

    expect(service.stopBenchmark).toHaveBeenCalledWith("acme");
    expect(service.playBenchmarkCase).toHaveBeenCalledTimes(1);
    expect(service.startBenchmarkRun).toHaveBeenCalledTimes(1);
    expect(state()).toMatchObject({ progress: null, queue: [], error: null, notes: {} });
  });

  it("Stop does nothing when nothing runs", () => {
    state().stop("acme");
    expect(service.stopBenchmark).not.toHaveBeenCalled();
  });

  it("does nothing without a model", async () => {
    expect(await state().run("acme", [])).toBe(false);
    expect(service.startBenchmarkRun).not.toHaveBeenCalled();
  });

  it("waits out the AI's rate limit, then goes on", async () => {
    vi.useFakeTimers();
    vi.mocked(capabilities.startModelMeasure).mockResolvedValue({ ...MEASURE("qwen3:8b"), cases: [] });
    vi.mocked(service.startBenchmarkRun).mockResolvedValue({ ...STARTED("qwen3:8b"), cases: ["a-case"] });
    vi.mocked(service.playBenchmarkCase).mockRejectedValueOnce(new Error("429")).mockResolvedValueOnce(RESULT("a-case"));
    vi.mocked(getRetryAfterSeconds).mockReturnValueOnce(30);

    const running = state().run("acme", ["qwen3:8b"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(state().progress?.waitSeconds).toBe(30);
    await vi.advanceTimersByTimeAsync(31_000);

    expect(await running).toBe(true);
    expect(service.playBenchmarkCase).toHaveBeenCalledTimes(2);
  });

  it("gives up waiting after too many rate limits and stops the queue", async () => {
    vi.useFakeTimers();
    vi.mocked(capabilities.startModelMeasure).mockResolvedValue({ ...MEASURE("qwen3:8b"), cases: [] });
    vi.mocked(service.startBenchmarkRun).mockResolvedValue({ ...STARTED("qwen3:8b"), cases: ["a-case"] });
    vi.mocked(service.playBenchmarkCase).mockRejectedValue(new Error("Too many requests"));
    vi.mocked(getRetryAfterSeconds).mockReturnValue(1);
    vi.mocked(getErrorStatus).mockReturnValue(429);

    const running = state().run("acme", ["qwen3:8b"]);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await running).toBe(false);
    expect(state().error).toBe("Too many requests");
  });

  /**
   * Test du CEO de la 1.10.0 : la table restait vide jusqu'à « Measure ». Le modèle de Cortex sans mesure complète se
   * mesure une fois, sans clic ; les autres restent à la demande.
   */
  describe("the model of Cortex, measured once without a click", () => {
    it.each([
      ["never measured", 0, true],
      ["partly measured", 1, true],
      ["fully measured", 2, false],
    ])("%s: measured %s", async (_state, measured, runs) => {
      useModelCapabilityStore.setState({ table: TABLE("qwen3:8b", measured) });

      expect(await state().measureCortexModel("acme")).toBe(runs);

      expect(capabilities.startModelMeasure).toHaveBeenCalledTimes(runs ? 1 : 0);
      if (runs) expect(capabilities.startModelMeasure).toHaveBeenCalledWith("acme", "qwen3:8b");
      expect(service.startBenchmarkRun).not.toHaveBeenCalled();
    });

    it("a capability too slow counts as measured: it isn't measured again on every opening", async () => {
      useModelCapabilityStore.setState({ table: TABLE("qwen3:8b", 1, 1) });
      expect(await state().measureCortexModel("acme")).toBe(false);
    });

    it("once a session: the table read again after the measure does not start another", async () => {
      useModelCapabilityStore.setState({ table: TABLE("qwen3:8b", 0) });
      vi.mocked(capabilities.getModelCapabilities).mockResolvedValue(TABLE("qwen3:8b", 0));

      expect(await state().measureCortexModel("acme")).toBe(true);
      expect(await state().measureCortexModel("acme")).toBe(false);

      expect(capabilities.startModelMeasure).toHaveBeenCalledTimes(1);
      expect(state().autoMeasured).toEqual(["qwen3:8b"]);
    });

    it("says it is the model of Cortex while it measures", async () => {
      useModelCapabilityStore.setState({ table: TABLE("qwen3:8b", 0) });
      vi.mocked(capabilities.measureModelCase).mockImplementationOnce(async (_slug, _run, key) => {
        expect(state().progress).toMatchObject({ model: "qwen3:8b", auto: true, phase: "running" });
        return CAP(key);
      });

      await state().measureCortexModel("acme");

      expect(capabilities.measureModelCase).toHaveBeenCalledTimes(1);
    });

    it("waits its turn: nothing starts while the queue runs, and a model that can't chat is never measured", async () => {
      expect(await state().measureCortexModel("acme")).toBe(false);
      useModelCapabilityStore.setState({ table: TABLE("gone:1b", 0) });
      expect(await state().measureCortexModel("acme")).toBe(false);
      useModelCapabilityStore.setState({ table: TABLE("qwen3:8b", 0) });
      useModelBenchmarkStore.setState({ progress: { model: "x", phase: "running", done: 0, total: 8, waitSeconds: null, stopping: false, auto: false } });
      expect(await state().measureCortexModel("acme")).toBe(false);
      useModelBenchmarkStore.setState({ progress: null, queue: [{ model: "y", scope: "everything" }] });
      expect(await state().measureCortexModel("acme")).toBe(false);
      useModelBenchmarkStore.setState({ queue: [] });
      expect(await state().measureCortexModel("")).toBe(false);
      useModelBenchmarkStore.setState({
        matrix: { ...MATRIX, models: [{ model: "qwen3:8b", current: true, lastRunAt: null, estimateSeconds: 1, cells: [], facts: { chat: false } as never }] },
      });
      expect(await state().measureCortexModel("acme")).toBe(false);

      expect(capabilities.startModelMeasure).not.toHaveBeenCalled();
    });
  });

  it("overturns a case: the detail comes back, the matrix is read again", async () => {
    vi.mocked(service.setBenchmarkVerdict).mockResolvedValueOnce(DETAIL).mockRejectedValueOnce(new Error("no"));

    expect(await state().overturn("acme", "qwen3:8b", 55, false)).toBe(true);
    expect(service.setBenchmarkVerdict).toHaveBeenCalledWith("acme", 55, false);
    expect(state().details["qwen3:8b"]).toEqual(DETAIL);
    expect(service.getBenchmarkMatrix).toHaveBeenCalled();

    expect(await state().overturn("acme", "qwen3:8b", 55, null)).toBe(false);
    expect(state().error).toBe("no");
  });

  it("runs a blind trial: the answers under their letters, then the choice, then the names", async () => {
    vi.mocked(service.startBlindTrial).mockResolvedValue(TRIAL);
    vi.mocked(service.playBlindTrialLetter).mockImplementation(async (_slug, _id, letter) => ({ letter, answer: `answer ${letter}`, durationMs: 1000, tooSlow: false }));
    vi.mocked(service.chooseBlindTrial).mockResolvedValue(REVEAL);
    useModelBenchmarkStore.setState({ details: { "qwen3:8b": DETAIL } });
    vi.mocked(service.getBenchmarkDetail).mockResolvedValue(DETAIL);

    expect(await state().startTrial("acme", REQUEST)).toBe(true);
    expect(service.startBlindTrial).toHaveBeenCalledWith("acme", REQUEST);
    expect(state().blind?.phase).toBe("choosing");
    expect(state().blind?.model).toBeNull();
    expect(state().blind?.answers.B.answer).toBe("answer B");
    expect(state().blind?.result).toBeNull();

    expect(await state().chooseTrial("acme", "A")).toBe(true);
    expect(service.chooseBlindTrial).toHaveBeenCalledWith("acme", 4, "A");
    expect(state().blind?.phase).toBe("revealed");
    expect(state().blind?.result?.chosenModel).toBe("qwen3:14b");
    // Le détail ouvert d'un modèle de l'essai se relit : le choix y apparaît.
    expect(service.getBenchmarkDetail).toHaveBeenCalledWith("acme", "qwen3:8b");
  });

  it("tries a single model: its name is known, no choice to make, the detail is read again", async () => {
    vi.mocked(service.startBlindTrial).mockResolvedValue({ ...TRIAL, letters: ["A"] });
    vi.mocked(service.playBlindTrialLetter).mockResolvedValue({ letter: "A", answer: "only", durationMs: 1000, tooSlow: false });
    useModelBenchmarkStore.setState({ details: { "qwen3:8b": DETAIL } });
    vi.mocked(service.getBenchmarkDetail).mockResolvedValue(DETAIL);

    expect(await state().startTrial("acme", { ...REQUEST, models: ["qwen3:8b"] })).toBe(true);

    expect(state().blind).toMatchObject({ phase: "tried", model: "qwen3:8b" });
    expect(service.chooseBlindTrial).not.toHaveBeenCalled();
    expect(service.getBenchmarkDetail).toHaveBeenCalledWith("acme", "qwen3:8b");
  });

  it("does not start a second trial, and a closed trial plays no further letter", async () => {
    useModelBenchmarkStore.setState({ blind: { phase: "answering", trial: TRIAL, answers: {}, result: null, model: null, waitSeconds: null } });
    expect(await state().startTrial("acme", REQUEST)).toBe(false);
    useModelBenchmarkStore.setState({ blind: null });

    vi.mocked(service.startBlindTrial).mockResolvedValue(TRIAL);
    vi.mocked(service.playBlindTrialLetter).mockImplementation(async (_slug, _id, letter) => {
      state().closeTrial();
      return { letter, answer: "late", durationMs: 1, tooSlow: false };
    });

    expect(await state().startTrial("acme", REQUEST)).toBe(false);
    expect(service.playBlindTrialLetter).toHaveBeenCalledTimes(1);
    expect(state().blind).toBeNull();
  });

  it("waits out the rate limit during a trial", async () => {
    vi.useFakeTimers();
    vi.mocked(service.startBlindTrial).mockResolvedValue({ ...TRIAL, letters: ["A"] });
    vi.mocked(service.playBlindTrialLetter).mockRejectedValueOnce(new Error("429")).mockResolvedValueOnce({ letter: "A", answer: "ok", durationMs: 1, tooSlow: false });
    vi.mocked(getRetryAfterSeconds).mockReturnValueOnce(10);

    const running = state().startTrial("acme", REQUEST);
    await vi.advanceTimersByTimeAsync(0);
    expect(state().blind?.waitSeconds).toBe(10);
    await vi.advanceTimersByTimeAsync(11_000);

    expect(await running).toBe(true);
    expect(state().blind?.phase).toBe("choosing");
  });

  it("says a failed trial, or a failed choice; a choice needs a trial", async () => {
    vi.mocked(getErrorStatus).mockReturnValueOnce(404);
    vi.mocked(service.startBlindTrial).mockRejectedValueOnce(new Error("Issue not found"));
    expect(await state().startTrial("acme", REQUEST)).toBe(false);
    expect(state().error).toBe("Issue not found");
    expect(state().blind).toBeNull();

    expect(await state().chooseTrial("acme", "A")).toBe(false);

    useModelBenchmarkStore.setState({ blind: { phase: "choosing", trial: TRIAL, answers: {}, result: null, model: null, waitSeconds: null } });
    vi.mocked(service.chooseBlindTrial).mockRejectedValueOnce(new Error("Too late"));
    expect(await state().chooseTrial("acme", null)).toBe(false);
    expect(state().error).toBe("Too late");
    expect(state().blind?.phase).toBe("choosing");
  });
});
