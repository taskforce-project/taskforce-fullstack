import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as service from "../api/model-capability-service";
import { getRetryAfterSeconds } from "../api/client";
import { measuredFully, useModelCapabilityStore } from "./model-capability-store";

vi.mock("../api/model-capability-service", () => ({
  chooseModel: vi.fn(),
  getModelCapabilities: vi.fn(),
  measureModelCase: vi.fn(),
  startModelMeasure: vi.fn(),
}));

vi.mock("../api/client", () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "Something went wrong"),
  getRetryAfterSeconds: vi.fn(() => null),
}));

const TABLE = {
  provider: "OLLAMA", instanceModel: "qwen3:8b", choice: null, current: "qwen3:8b", suiteVersion: 1,
  capabilities: [], cases: [], models: [], proposals: [], proposed: null,
};
const STARTED = { runId: 9, model: "qwen3:14b", startedAt: "2026-11-04T10:00:00", cases: ["tools-move", "code-js-sort"] };
const RESULT = (caseKey: string, passed: boolean) => ({
  caseKey, capability: caseKey.split("-")[0], passed, checks: [], answer: "ok", model: "qwen3:14b", promptTokens: 3100,
});

describe("useModelCapabilityStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useModelCapabilityStore.setState({ table: null, progress: null, results: [], error: null, autoMeasured: [] });
    vi.mocked(service.getModelCapabilities).mockResolvedValue(TABLE);
  });

  afterEach(() => vi.useRealTimers());

  it("reads the table of the instance, and keeps it when it can't", async () => {
    expect(await useModelCapabilityStore.getState().fetchTable("acme")).toEqual(TABLE);
    vi.mocked(service.getModelCapabilities).mockRejectedValueOnce(new Error("down"));
    expect(await useModelCapabilityStore.getState().fetchTable("acme")).toBeNull();
    expect(useModelCapabilityStore.getState().table).toEqual(TABLE);
  });

  it("measures a model case by case, then reads the table again", async () => {
    vi.mocked(service.startModelMeasure).mockResolvedValue(STARTED);
    vi.mocked(service.measureModelCase)
      .mockResolvedValueOnce(RESULT("tools-move", true))
      .mockResolvedValueOnce(RESULT("code-js-sort", false));

    expect(await useModelCapabilityStore.getState().measure("acme", "qwen3:14b")).toBe(true);

    expect(service.measureModelCase).toHaveBeenNthCalledWith(1, "acme", 9, "tools-move");
    expect(service.measureModelCase).toHaveBeenNthCalledWith(2, "acme", 9, "code-js-sort");
    expect(useModelCapabilityStore.getState()).toMatchObject({ progress: null, error: null, table: TABLE });
    expect(useModelCapabilityStore.getState().results.map((r) => r.passed)).toEqual([true, false]);
  });

  it("waits for the AI rate limit, then measures the case", async () => {
    vi.useFakeTimers();
    vi.mocked(service.startModelMeasure).mockResolvedValue({ ...STARTED, cases: ["tools-move"] });
    vi.mocked(service.measureModelCase).mockRejectedValueOnce(new Error("429")).mockResolvedValue(RESULT("tools-move", true));
    vi.mocked(getRetryAfterSeconds).mockReturnValueOnce(41);

    const measuring = useModelCapabilityStore.getState().measure("acme", "qwen3:14b");
    await vi.advanceTimersByTimeAsync(0);
    expect(useModelCapabilityStore.getState().progress).toMatchObject({ model: "qwen3:14b", waitSeconds: 41, done: 0, total: 1 });
    await vi.advanceTimersByTimeAsync(42_000);

    expect(await measuring).toBe(true);
    expect(service.measureModelCase).toHaveBeenCalledTimes(2);
  });

  it("stops on a model failure, keeps what was measured and says why", async () => {
    vi.mocked(service.startModelMeasure).mockResolvedValue(STARTED);
    vi.mocked(service.measureModelCase).mockResolvedValueOnce(RESULT("tools-move", true))
      .mockRejectedValueOnce(new Error("The AI provider is down"));

    expect(await useModelCapabilityStore.getState().measure("acme", "qwen3:14b")).toBe(false);
    expect(useModelCapabilityStore.getState()).toMatchObject({ progress: null, error: "The AI provider is down" });
    expect(useModelCapabilityStore.getState().results).toHaveLength(1);
  });

  it("stops before the next case when the person asks, and runs one measure at a time", async () => {
    vi.mocked(service.startModelMeasure).mockResolvedValue(STARTED);
    vi.mocked(service.measureModelCase).mockImplementation(async (_slug, _run, caseKey) => {
      useModelCapabilityStore.getState().stop();
      return RESULT(caseKey, true);
    });

    const measuring = useModelCapabilityStore.getState().measure("acme", "qwen3:14b");
    expect(await useModelCapabilityStore.getState().measure("acme", "qwen3:8b")).toBe(false);
    expect(await measuring).toBe(true);
    expect(service.measureModelCase).toHaveBeenCalledTimes(1);
    expect(service.startModelMeasure).toHaveBeenCalledTimes(1);
  });

  /**
   * Test du CEO de la 1.10.0 : la table restait vide jusqu'à « Measure ». Le modèle de Cortex sans mesure complète se
   * mesure une fois, sans clic ; les autres restent à la demande.
   */
  describe("the model of Cortex, measured once without a click", () => {
    const score = (measured: number) => ({
      capability: "tools", passed: measured, measured, total: 2, capable: measured === 2, heldWords: null, measuredAt: null,
    });
    const row = (model: string, measured: number) => ({
      model, current: false, measuredAt: measured ? "2026-11-05T10:00:00" : null, scores: [score(measured), score(measured)],
    });
    const table = (current: string, measured: number) => ({
      ...TABLE, current, models: [row("qwen3:8b", measured), row("qwen3:14b", 0)],
    });

    beforeEach(() => {
      vi.mocked(service.startModelMeasure).mockResolvedValue({ ...STARTED, model: "qwen3:8b", cases: ["tools-move"] });
      vi.mocked(service.measureModelCase).mockResolvedValue(RESULT("tools-move", true));
    });

    it.each([
      ["never measured", 0, true],
      ["partly measured", 1, true],
      ["fully measured", 2, false],
    ])("%s: measured %s", async (_state, measured, runs) => {
      useModelCapabilityStore.setState({ table: table("qwen3:8b", measured) });

      expect(await useModelCapabilityStore.getState().measureCortexModel("acme")).toBe(runs);

      expect(service.startModelMeasure).toHaveBeenCalledTimes(runs ? 1 : 0);
      if (runs) expect(service.startModelMeasure).toHaveBeenCalledWith("acme", "qwen3:8b");
    });

    it("once a session: the table read again after the measure does not start another", async () => {
      useModelCapabilityStore.setState({ table: table("qwen3:8b", 0) });
      vi.mocked(service.getModelCapabilities).mockResolvedValue(table("qwen3:8b", 0));

      expect(await useModelCapabilityStore.getState().measureCortexModel("acme")).toBe(true);
      expect(await useModelCapabilityStore.getState().measureCortexModel("acme")).toBe(false);

      expect(service.startModelMeasure).toHaveBeenCalledTimes(1);
      expect(useModelCapabilityStore.getState().autoMeasured).toEqual(["qwen3:8b"]);
    });

    it("says it is the model of Cortex while it measures", async () => {
      useModelCapabilityStore.setState({ table: table("qwen3:8b", 0) });
      vi.mocked(service.measureModelCase).mockImplementationOnce(async (_slug, _run, caseKey) => {
        expect(useModelCapabilityStore.getState().progress).toMatchObject({ model: "qwen3:8b", auto: true });
        return RESULT(caseKey, true);
      });

      await useModelCapabilityStore.getState().measureCortexModel("acme");

      expect(service.measureModelCase).toHaveBeenCalledTimes(1);
    });

    it("measures the new model after the person changes Cortex's model", async () => {
      useModelCapabilityStore.setState({ table: table("qwen3:8b", 2) });
      expect(await useModelCapabilityStore.getState().measureCortexModel("acme")).toBe(false);
      vi.mocked(service.chooseModel).mockResolvedValueOnce(table("qwen3:14b", 2));
      vi.mocked(service.startModelMeasure).mockResolvedValue({ ...STARTED, cases: ["tools-move"] });

      await useModelCapabilityStore.getState().choose("acme", "qwen3:14b");
      expect(await useModelCapabilityStore.getState().measureCortexModel("acme")).toBe(true);

      expect(service.startModelMeasure).toHaveBeenCalledWith("acme", "qwen3:14b");
    });

    it("does nothing without a table, while a measure runs, or for a model the table doesn't list", async () => {
      expect(await useModelCapabilityStore.getState().measureCortexModel("acme")).toBe(false);
      useModelCapabilityStore.setState({ table: table("gone:1b", 0) });
      expect(await useModelCapabilityStore.getState().measureCortexModel("acme")).toBe(false);
      useModelCapabilityStore.setState({
        table: table("qwen3:8b", 0),
        progress: { model: "qwen3:14b", done: 0, total: 8, waitSeconds: null, stopping: false, auto: false },
      });
      expect(await useModelCapabilityStore.getState().measureCortexModel("acme")).toBe(false);
      expect(await useModelCapabilityStore.getState().measureCortexModel("")).toBe(false);

      expect(service.startModelMeasure).not.toHaveBeenCalled();
    });

    it("a row is fully measured when each case of each capability has a note", () => {
      expect(measuredFully(row("qwen3:8b", 2))).toBe(true);
      expect(measuredFully(row("qwen3:8b", 1))).toBe(false);
      expect(measuredFully({ model: "x", current: false, measuredAt: null, scores: [] })).toBe(false);
    });
  });

  it("chooses the model of Cortex, or says why it can't", async () => {
    const chosen = { ...TABLE, choice: "qwen3:14b", current: "qwen3:14b" };
    vi.mocked(service.chooseModel).mockResolvedValueOnce(chosen)
      .mockRejectedValueOnce(new Error("The AI of this instance doesn't serve gone:1b."));

    expect(await useModelCapabilityStore.getState().choose("acme", "qwen3:14b")).toBe(true);
    expect(useModelCapabilityStore.getState().table).toEqual(chosen);
    expect(await useModelCapabilityStore.getState().choose("acme", "gone:1b")).toBe(false);
    expect(useModelCapabilityStore.getState().error).toBe("The AI of this instance doesn't serve gone:1b.");
  });
});
