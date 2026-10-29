import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as service from "../api/eval-service";
import { getRetryAfterSeconds } from "../api/client";
import { useEvalStore } from "./eval-store";

vi.mock("../api/eval-service", () => ({
  archiveEvalCase: vi.fn(),
  createEvalCase: vi.fn(),
  draftEvalCase: vi.fn(),
  getEvalBank: vi.fn(),
  getEvalRun: vi.fn(),
  runEvalCase: vi.fn(),
  setEvalBankEnabled: vi.fn(),
  startEvalRun: vi.fn(),
}));

vi.mock("../api/client", () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "Something went wrong"),
  getRetryAfterSeconds: vi.fn(() => null),
}));

const CASE = {
  id: 40, title: "Kernel check", question: "Create an issue", tool: "create_issue",
  createdAt: "2026-10-29T09:00:00", criteriaAt: "2026-10-29T09:00:00", mine: true,
};
const LATER = { ...CASE, id: 41, criteriaAt: "2026-10-29T11:00:00" };
const RUN = { id: 9, model: "llama3.2", startedAt: "2026-10-29T10:00:00", finishedAt: null, total: 2, passed: 0 };
const BANK = { enabled: true, canManage: true, cases: [CASE], runs: [] };
const RESULT = { caseId: 40, title: "Kernel check", passed: true, checks: [], calls: [], answer: "ok", model: "llama3.2" };
const DETAIL = { run: { ...RUN, finishedAt: "2026-10-29T10:01:00", passed: 1 }, results: [RESULT] };
const CRITERIA = { tool: "create_issue", args: {}, effect: "" as const, forbid: [], contains: [], notContains: [] };

describe("useEvalStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEvalStore.setState({ bank: null, run: null, progress: null, error: null });
  });

  afterEach(() => vi.useRealTimers());

  it("reads the bank of the workspace", async () => {
    vi.mocked(service.getEvalBank).mockResolvedValue(BANK);

    expect(await useEvalStore.getState().fetchBank("acme")).toEqual(BANK);
    expect(useEvalStore.getState().bank).toEqual(BANK);
  });

  it("keeps the bank when it can't be read", async () => {
    useEvalStore.setState({ bank: BANK });
    vi.mocked(service.getEvalBank).mockRejectedValue(new Error("down"));

    expect(await useEvalStore.getState().fetchBank("acme")).toBeNull();
    expect(useEvalStore.getState().bank).toEqual(BANK);
  });

  it("drafts a case, or says why it can't", async () => {
    const draft = { record: "r-1", title: "T", question: "Q", askedOn: null, notes: [], calls: [], criteria: CRITERIA };
    vi.mocked(service.draftEvalCase).mockResolvedValueOnce(draft)
      .mockRejectedValueOnce(new Error("The test bank of this workspace is turned off"));

    expect(await useEvalStore.getState().draftCase("acme", "r-1")).toEqual(draft);
    expect(await useEvalStore.getState().draftCase("acme", "r-1")).toBeNull();
    expect(useEvalStore.getState().error).toBe("The test bank of this workspace is turned off");
  });

  it("adds a case at the top of the bank", async () => {
    useEvalStore.setState({ bank: { ...BANK, cases: [LATER] } });
    vi.mocked(service.createEvalCase).mockResolvedValue(CASE);

    expect(await useEvalStore.getState().addCase("acme", "r-1", "Kernel check", CRITERIA)).toEqual(CASE);
    expect(useEvalStore.getState().bank?.cases.map((c) => c.id)).toEqual([40, 41]);
    expect(service.createEvalCase).toHaveBeenCalledWith("acme", "r-1", "Kernel check", CRITERIA);
  });

  it("adds a case before the bank is read", async () => {
    vi.mocked(service.createEvalCase).mockResolvedValue(CASE);

    expect(await useEvalStore.getState().addCase("acme", "r-1", "T", CRITERIA)).toEqual(CASE);
    expect(useEvalStore.getState().bank).toBeNull();
  });

  it("says why a case can't be added", async () => {
    vi.mocked(service.createEvalCase).mockRejectedValue(new Error("A case needs at least one criterion."));

    expect(await useEvalStore.getState().addCase("acme", "r-1", "T", CRITERIA)).toBeNull();
    expect(useEvalStore.getState().error).toBe("A case needs at least one criterion.");
  });

  it.each([
    ["with the bank read", BANK, []],
    ["before the bank is read", null, undefined],
  ])("archives a case %s", async (_label, bank, cases) => {
    useEvalStore.setState({ bank });
    vi.mocked(service.archiveEvalCase).mockResolvedValue();

    expect(await useEvalStore.getState().archiveCase("acme", 40)).toBe(true);
    expect(useEvalStore.getState().bank?.cases).toEqual(cases);
  });

  it("says why a case can't be archived", async () => {
    vi.mocked(service.archiveEvalCase).mockRejectedValue(new Error("Only the person who added this case"));

    expect(await useEvalStore.getState().archiveCase("acme", 40)).toBe(false);
    expect(useEvalStore.getState().error).toBe("Only the person who added this case");
  });

  it.each([
    ["with the bank read", BANK, false],
    ["before the bank is read", null, undefined],
  ])("turns the bank off %s", async (_label, bank, enabled) => {
    useEvalStore.setState({ bank });
    vi.mocked(service.setEvalBankEnabled).mockResolvedValue(false);

    expect(await useEvalStore.getState().setEnabled("acme", false)).toBe(true);
    expect(useEvalStore.getState().bank?.enabled).toBe(enabled);
  });

  it("says why the bank can't be switched", async () => {
    vi.mocked(service.setEvalBankEnabled).mockRejectedValue(new Error("Forbidden"));

    expect(await useEvalStore.getState().setEnabled("acme", true)).toBe(false);
    expect(useEvalStore.getState().error).toBe("Forbidden");
  });

  it("replays the cases written before the run, one by one, then shows the grades", async () => {
    vi.mocked(service.startEvalRun).mockResolvedValue(RUN);
    vi.mocked(service.getEvalBank).mockResolvedValue({ ...BANK, cases: [LATER, CASE] });
    vi.mocked(service.runEvalCase).mockResolvedValue(RESULT);
    vi.mocked(service.getEvalRun).mockResolvedValue(DETAIL);

    expect(await useEvalStore.getState().runBank("acme", "llama3.2")).toEqual(DETAIL);

    expect(service.startEvalRun).toHaveBeenCalledWith("acme", "llama3.2");
    expect(service.runEvalCase).toHaveBeenCalledTimes(1);
    expect(service.runEvalCase).toHaveBeenCalledWith("acme", 9, 40);
    expect(useEvalStore.getState()).toMatchObject({ run: DETAIL, progress: null, error: null });
  });

  it("runs one replay at a time", async () => {
    useEvalStore.setState({ progress: { done: 0, total: 1, waitSeconds: null, stopping: false } });

    expect(await useEvalStore.getState().runBank("acme", "llama3.2")).toBeNull();
    expect(service.startEvalRun).not.toHaveBeenCalled();
  });

  it("says why a run can't start", async () => {
    vi.mocked(service.startEvalRun).mockRejectedValue(new Error("The test bank has no case yet"));

    expect(await useEvalStore.getState().runBank("acme", "")).toBeNull();
    expect(useEvalStore.getState()).toMatchObject({ error: "The test bank has no case yet", progress: null });
    expect(service.getEvalRun).not.toHaveBeenCalled();
  });

  it("waits for the AI rate limit, then grades the case", async () => {
    vi.useFakeTimers();
    vi.mocked(service.startEvalRun).mockResolvedValue(RUN);
    vi.mocked(service.getEvalBank).mockResolvedValue(BANK);
    vi.mocked(service.runEvalCase).mockRejectedValueOnce(new Error("429")).mockResolvedValue(RESULT);
    vi.mocked(getRetryAfterSeconds).mockReturnValueOnce(41);
    vi.mocked(service.getEvalRun).mockResolvedValue(DETAIL);

    const running = useEvalStore.getState().runBank("acme", "llama3.2");
    await vi.advanceTimersByTimeAsync(0);
    expect(useEvalStore.getState().progress).toMatchObject({ waitSeconds: 41, done: 0, total: 1 });
    await vi.advanceTimersByTimeAsync(42_000);

    expect(await running).toEqual(DETAIL);
    expect(service.runEvalCase).toHaveBeenCalledTimes(2);
  });

  it("stops on a model failure and keeps the cases graded so far", async () => {
    const partial = { run: RUN, results: [RESULT] };
    vi.mocked(service.startEvalRun).mockResolvedValue(RUN);
    vi.mocked(service.getEvalBank).mockResolvedValue({ ...BANK, cases: [CASE, { ...CASE, id: 42 }] });
    vi.mocked(service.runEvalCase).mockResolvedValueOnce(RESULT).mockRejectedValueOnce(new Error("The AI service is down"));
    vi.mocked(service.getEvalRun).mockResolvedValue(partial);

    expect(await useEvalStore.getState().runBank("acme", "llama3.2")).toEqual(partial);
    expect(useEvalStore.getState()).toMatchObject({ run: partial, error: "The AI service is down", progress: null });
  });

  it("stops before the next case when asked", async () => {
    vi.mocked(service.startEvalRun).mockResolvedValue(RUN);
    vi.mocked(service.getEvalBank).mockResolvedValue({ ...BANK, cases: [CASE, { ...CASE, id: 42 }] });
    vi.mocked(service.runEvalCase).mockImplementation(async () => {
      useEvalStore.getState().stopRun();
      return RESULT;
    });
    vi.mocked(service.getEvalRun).mockResolvedValue(DETAIL);

    await useEvalStore.getState().runBank("acme", "llama3.2");

    expect(service.runEvalCase).toHaveBeenCalledTimes(1);
    expect(useEvalStore.getState().progress).toBeNull();
  });

  it("keeps the bank it has when the run can't reread it, and returns nothing when the run can't be read", async () => {
    useEvalStore.setState({ bank: BANK });
    vi.mocked(service.startEvalRun).mockResolvedValue(RUN);
    vi.mocked(service.getEvalBank).mockRejectedValue(new Error("down"));
    vi.mocked(service.runEvalCase).mockResolvedValue(RESULT);
    vi.mocked(service.getEvalRun).mockRejectedValue(new Error("down"));

    expect(await useEvalStore.getState().runBank("acme", "llama3.2")).toBeNull();
    expect(service.runEvalCase).toHaveBeenCalledWith("acme", 9, 40);
  });

  it("does nothing when asked to stop with no run", () => {
    useEvalStore.getState().stopRun();

    expect(useEvalStore.getState().progress).toBeNull();
  });

  it("opens a past run, or says why it can't", async () => {
    vi.mocked(service.getEvalRun).mockResolvedValueOnce(DETAIL).mockRejectedValueOnce(new Error("This run was not found."));

    expect(await useEvalStore.getState().openRun("acme", 9)).toEqual(DETAIL);
    expect(useEvalStore.getState().run).toEqual(DETAIL);
    expect(await useEvalStore.getState().openRun("acme", 10)).toBeNull();
    expect(useEvalStore.getState().error).toBe("This run was not found.");
  });
});
