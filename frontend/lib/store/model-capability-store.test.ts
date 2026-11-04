import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as service from "../api/model-capability-service";
import { getRetryAfterSeconds } from "../api/client";
import { useModelCapabilityStore } from "./model-capability-store";

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
    useModelCapabilityStore.setState({ table: null, progress: null, results: [], error: null });
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
