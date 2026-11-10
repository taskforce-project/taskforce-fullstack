import { beforeEach, describe, expect, it, vi } from "vitest";

import * as service from "../api/model-capability-service";
import { measuredFully, useModelCapabilityStore } from "./model-capability-store";

vi.mock("../api/model-capability-service", () => ({
  chooseModel: vi.fn(),
  getModelCapabilities: vi.fn(),
}));

vi.mock("../api/client", () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "Something went wrong"),
}));

const TABLE = {
  provider: "OLLAMA", instanceModel: "qwen3:8b", choice: null, current: "qwen3:8b", suiteVersion: 1,
  capabilities: [], cases: [], models: [], proposals: [], proposed: null,
};

/** La table de ce que sait faire chaque modèle, et le modèle de Cortex. La mesure passe par la file du banc. */
describe("useModelCapabilityStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useModelCapabilityStore.setState({ table: null, error: null });
    vi.mocked(service.getModelCapabilities).mockResolvedValue(TABLE);
  });

  it("reads the table of the instance, and keeps it when it can't", async () => {
    expect(await useModelCapabilityStore.getState().fetchTable("acme")).toEqual(TABLE);
    vi.mocked(service.getModelCapabilities).mockRejectedValueOnce(new Error("down"));
    expect(await useModelCapabilityStore.getState().fetchTable("acme")).toBeNull();
    expect(useModelCapabilityStore.getState().table).toEqual(TABLE);
  });

  it.each([
    ["each case has a note", 2, 0, true],
    ["a case is missing", 1, 0, false],
    ["a case too slow still counts as measured", 1, 1, true],
  ])("a row is fully measured when %s", (_title, measured, tooSlow, expected) => {
    const score = { capability: "tools", passed: measured, measured, total: 2, capable: false, heldWords: null, measuredAt: null, tooSlow };
    expect(measuredFully({ model: "x", current: false, measuredAt: null, scores: [score, score] })).toBe(expected);
  });

  it("a row without any capability is not measured", () => {
    expect(measuredFully({ model: "x", current: false, measuredAt: null, scores: [] })).toBe(false);
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

  it("the instance's model changed: the last gesture wins over a model pinned with Use for Cortex", async () => {
    const pinned = { ...TABLE, choice: "qwen3:14b", current: "qwen3:14b" };
    useModelCapabilityStore.setState({ table: pinned });
    vi.mocked(service.chooseModel).mockResolvedValueOnce({ ...TABLE, choice: null });

    expect(await useModelCapabilityStore.getState().instanceChanged("acme")).toBe(true);
    expect(service.chooseModel).toHaveBeenCalledWith("acme", null);
    expect(useModelCapabilityStore.getState().table?.choice).toBeNull();
  });

  it("the instance's model changed with nothing pinned: the table is read again, and says when it can't be", async () => {
    useModelCapabilityStore.setState({ table: { ...TABLE, choice: null } });
    vi.mocked(service.getModelCapabilities).mockResolvedValueOnce(TABLE).mockRejectedValueOnce(new Error("down"));

    expect(await useModelCapabilityStore.getState().instanceChanged("acme")).toBe(true);
    expect(service.chooseModel).not.toHaveBeenCalled();
    expect(await useModelCapabilityStore.getState().instanceChanged("acme")).toBe(false);
  });
});
