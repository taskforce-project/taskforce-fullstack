import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getRetryAfterSeconds } from "../api/client";
import * as service from "../api/model-benchmark-service";
import type { BenchmarkMatrix, BenchmarkModelDetail, BlindTrialResult, BlindTrialStarted } from "../api/model-benchmark-service";
import { useModelBenchmarkStore } from "./model-benchmark-store";

vi.mock("../api/model-benchmark-service", () => ({
  chooseBlindTrial: vi.fn(),
  getBenchmarkDetail: vi.fn(),
  getBenchmarkMatrix: vi.fn(),
  playBenchmarkCase: vi.fn(),
  playBlindTrialLetter: vi.fn(),
  setBenchmarkVerdict: vi.fn(),
  startBenchmarkRun: vi.fn(),
  startBlindTrial: vi.fn(),
}));

vi.mock("../api/client", () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "Something went wrong"),
  getRetryAfterSeconds: vi.fn(() => null),
}));

const MATRIX = {
  provider: "OLLAMA", current: "qwen3:8b", suiteVersion: 1, cases: 2, tasks: [], models: [],
} as BenchmarkMatrix;
const STARTED = (model: string) => ({ runId: 9, model, startedAt: "2026-11-08T10:00:00", cases: ["a-case", "b-case"] });
const RESULT = (caseKey: string) => ({
  resultId: 1, caseKey, title: "t", passed: true, gradedPassed: true, personPassed: null, judge: null, checks: [], calls: [], answer: "ok",
  durationMs: 1000, at: "2026-11-08T10:00:00",
});
const DETAIL = { model: "qwen3:8b", current: true, lastRunAt: null, cases: 2, tasks: [], trials: [] } as BenchmarkModelDetail;
const TRIAL: BlindTrialStarted = { trialId: 4, task: "summarize", issueKey: "OPS-35", letters: ["A", "B"] };
const REQUEST = { projectId: 3, issueId: 40, task: "summarize", models: ["qwen3:8b", "qwen3:14b"] };
const REVEAL: BlindTrialResult = {
  trialId: 4, task: "summarize", issueKey: "OPS-35", chosenLetter: "A", chosenModel: "qwen3:14b", decidedAt: "2026-11-08T10:00:00",
  answers: [{ letter: "A", model: "qwen3:14b", answer: "un", durationMs: 1000 }, { letter: "B", model: "qwen3:8b", answer: "deux", durationMs: 2000 }],
};
const INITIAL = { matrix: null, details: {}, progress: null, blind: null, openModel: null, error: null };
const state = () => useModelBenchmarkStore.getState();

/** Le banc des modèles (R131) : le store tient le passage, qui continue quand le composant n'est plus à l'écran. */
describe("useModelBenchmarkStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useModelBenchmarkStore.setState({ ...INITIAL });
    vi.mocked(service.getBenchmarkMatrix).mockResolvedValue(MATRIX);
    vi.mocked(getRetryAfterSeconds).mockReturnValue(null);
  });

  afterEach(() => vi.useRealTimers());

  it("reads the matrix and keeps it when it can't", async () => {
    expect(await state().fetchMatrix("acme")).toEqual(MATRIX);
    vi.mocked(service.getBenchmarkMatrix).mockRejectedValueOnce(new Error("down"));
    expect(await state().fetchMatrix("acme")).toBeNull();
    expect(state().matrix).toEqual(MATRIX);
  });

  it("keeps the open row, for when the person comes back to the tab", () => {
    state().setOpenModel("qwen3:8b");
    expect(state().openModel).toBe("qwen3:8b");
    state().setOpenModel(null);
    expect(state().openModel).toBeNull();
  });

  it("reads a model's detail, by model, and returns null when it can't", async () => {
    vi.mocked(service.getBenchmarkDetail).mockResolvedValueOnce(DETAIL).mockRejectedValueOnce(new Error("down"));
    expect(await state().fetchDetail("acme", "qwen3:8b")).toEqual(DETAIL);
    expect(state().details["qwen3:8b"]).toEqual(DETAIL);
    expect(await state().fetchDetail("acme", "qwen3:8b")).toBeNull();
    expect(state().details["qwen3:8b"]).toEqual(DETAIL);
  });

  it("runs the models in order, case by case, the matrix read as it goes; the progress then clears", async () => {
    useModelBenchmarkStore.setState({ matrix: MATRIX });
    vi.mocked(service.startBenchmarkRun).mockImplementation(async (_slug, model) => STARTED(model));
    vi.mocked(service.playBenchmarkCase).mockImplementation(async (_slug, _run, key) => RESULT(key));
    const seen: Array<[string, number, number]> = [];
    const unsubscribe = useModelBenchmarkStore.subscribe((s) => {
      if (s.progress) seen.push([s.progress.model, s.progress.done, s.progress.total]);
    });

    expect(await state().run("acme", ["qwen3:8b", "qwen3:14b"])).toBe(true);
    unsubscribe();

    expect(service.startBenchmarkRun).toHaveBeenNthCalledWith(1, "acme", "qwen3:8b");
    expect(service.startBenchmarkRun).toHaveBeenNthCalledWith(2, "acme", "qwen3:14b");
    expect(service.playBenchmarkCase).toHaveBeenCalledTimes(4);
    expect(seen).toContainEqual(["qwen3:14b", 3, 4]);
    expect(state().progress).toBeNull();
    expect(service.getBenchmarkMatrix).toHaveBeenCalledTimes(5);
    expect(state().matrix).toEqual(MATRIX);
  });

  it("refreshes an open detail at the end of each model", async () => {
    useModelBenchmarkStore.setState({ matrix: MATRIX, details: { "qwen3:8b": DETAIL } });
    vi.mocked(service.startBenchmarkRun).mockResolvedValue(STARTED("qwen3:8b"));
    vi.mocked(service.playBenchmarkCase).mockImplementation(async (_slug, _run, key) => RESULT(key));
    vi.mocked(service.getBenchmarkDetail).mockResolvedValue(DETAIL);

    await state().run("acme", ["qwen3:8b"]);

    expect(service.getBenchmarkDetail).toHaveBeenCalledWith("acme", "qwen3:8b");
  });

  it("stops at a click, before the next case", async () => {
    vi.mocked(service.startBenchmarkRun).mockResolvedValue(STARTED("qwen3:8b"));
    vi.mocked(service.playBenchmarkCase).mockImplementation(async (_slug, _run, key) => {
      state().stop();
      return RESULT(key);
    });

    expect(await state().run("acme", ["qwen3:8b", "qwen3:14b"])).toBe(true);

    expect(service.playBenchmarkCase).toHaveBeenCalledTimes(1);
    expect(service.startBenchmarkRun).toHaveBeenCalledTimes(1);
    expect(state().progress).toBeNull();
  });

  it("does nothing while a run is under way, or without a model", async () => {
    useModelBenchmarkStore.setState({ progress: { model: "x", done: 0, total: 1, waitSeconds: null, stopping: false } });
    expect(await state().run("acme", ["qwen3:8b"])).toBe(false);
    useModelBenchmarkStore.setState({ progress: null });
    expect(await state().run("acme", [])).toBe(false);
    expect(service.startBenchmarkRun).not.toHaveBeenCalled();
  });

  it("waits out the AI's rate limit, then goes on", async () => {
    vi.useFakeTimers();
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

  it("stops on a failure of the model, says it, and clears the progress", async () => {
    vi.mocked(service.startBenchmarkRun).mockResolvedValue(STARTED("qwen3:8b"));
    vi.mocked(service.playBenchmarkCase).mockRejectedValue(new Error("The AI is down"));

    expect(await state().run("acme", ["qwen3:8b"])).toBe(false);

    expect(state().error).toBe("The AI is down");
    expect(state().progress).toBeNull();
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
    vi.mocked(service.playBlindTrialLetter).mockImplementation(async (_slug, _id, letter) => ({ letter, answer: `answer ${letter}`, durationMs: 1000 }));
    vi.mocked(service.chooseBlindTrial).mockResolvedValue(REVEAL);
    useModelBenchmarkStore.setState({ details: { "qwen3:8b": DETAIL } });
    vi.mocked(service.getBenchmarkDetail).mockResolvedValue(DETAIL);

    expect(await state().startTrial("acme", REQUEST)).toBe(true);
    expect(service.startBlindTrial).toHaveBeenCalledWith("acme", REQUEST);
    expect(state().blind?.phase).toBe("choosing");
    expect(state().blind?.answers.B.answer).toBe("answer B");
    expect(state().blind?.result).toBeNull();

    expect(await state().chooseTrial("acme", "A")).toBe(true);
    expect(service.chooseBlindTrial).toHaveBeenCalledWith("acme", 4, "A");
    expect(state().blind?.phase).toBe("revealed");
    expect(state().blind?.result?.chosenModel).toBe("qwen3:14b");
    // Le détail ouvert d'un modèle de l'essai se relit : le choix y apparaît.
    expect(service.getBenchmarkDetail).toHaveBeenCalledWith("acme", "qwen3:8b");
  });

  it("does not start a second trial, and a closed trial plays no further letter", async () => {
    useModelBenchmarkStore.setState({ blind: { phase: "answering", trial: TRIAL, answers: {}, result: null, waitSeconds: null } });
    expect(await state().startTrial("acme", REQUEST)).toBe(false);
    useModelBenchmarkStore.setState({ blind: null });

    vi.mocked(service.startBlindTrial).mockResolvedValue(TRIAL);
    vi.mocked(service.playBlindTrialLetter).mockImplementation(async (_slug, _id, letter) => {
      state().closeTrial();
      return { letter, answer: "late", durationMs: 1 };
    });

    expect(await state().startTrial("acme", REQUEST)).toBe(false);
    expect(service.playBlindTrialLetter).toHaveBeenCalledTimes(1);
    expect(state().blind).toBeNull();
  });

  it("waits out the rate limit during a trial", async () => {
    vi.useFakeTimers();
    vi.mocked(service.startBlindTrial).mockResolvedValue({ ...TRIAL, letters: ["A"] });
    vi.mocked(service.playBlindTrialLetter).mockRejectedValueOnce(new Error("429")).mockResolvedValueOnce({ letter: "A", answer: "ok", durationMs: 1 });
    vi.mocked(getRetryAfterSeconds).mockReturnValueOnce(10);

    const running = state().startTrial("acme", REQUEST);
    await vi.advanceTimersByTimeAsync(0);
    expect(state().blind?.waitSeconds).toBe(10);
    await vi.advanceTimersByTimeAsync(11_000);

    expect(await running).toBe(true);
    expect(state().blind?.phase).toBe("choosing");
  });

  it("says a failed trial, or a failed choice; a choice needs a trial", async () => {
    vi.mocked(service.startBlindTrial).mockRejectedValueOnce(new Error("Issue not found"));
    expect(await state().startTrial("acme", REQUEST)).toBe(false);
    expect(state().error).toBe("Issue not found");
    expect(state().blind).toBeNull();

    expect(await state().chooseTrial("acme", "A")).toBe(false);

    useModelBenchmarkStore.setState({ blind: { phase: "choosing", trial: TRIAL, answers: {}, result: null, waitSeconds: null } });
    vi.mocked(service.chooseBlindTrial).mockRejectedValueOnce(new Error("Too late"));
    expect(await state().chooseTrial("acme", null)).toBe(false);
    expect(state().error).toBe("Too late");
    expect(state().blind?.phase).toBe("choosing");
  });
});
