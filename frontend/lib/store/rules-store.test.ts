import { beforeEach, describe, expect, it, vi } from "vitest";

import * as service from "../api/rules-service";
import { useRulesStore } from "./rules-store";

vi.mock("../api/rules-service", () => ({
  addRule: vi.fn(),
  checkAction: vi.fn(),
  draftRule: vi.fn(),
  getRules: vi.fn(),
  removeRule: vi.fn(),
}));

vi.mock("../api/client", () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "Something went wrong"),
}));

const OVERVIEW = {
  version: 1, digest: "sha256:x", floor: ["floor-irreversible"], defaults: [], layers: [], versions: [], members: [],
  projects: [], canEdit: true,
};
const DRAFT = {
  text: "x", scope: "workspace" as const, ref: null, rules: [], modelCases: [], cases: [], broken: [], problems: [],
  approverNeeded: null, unclear: null, passed: true,
};

describe("useRulesStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRulesStore.setState({ overview: null, slug: null, loading: false, loadFailed: false, error: null });
  });

  it("reads the rules of a workspace", async () => {
    vi.mocked(service.getRules).mockResolvedValue(OVERVIEW);

    expect(await useRulesStore.getState().fetchRules("acme")).toEqual(OVERVIEW);
    expect(useRulesStore.getState()).toMatchObject({ overview: OVERVIEW, slug: "acme", loading: false, loadFailed: false });
  });

  it("says when the rules couldn't be read, and forgets another workspace's", async () => {
    useRulesStore.setState({ overview: OVERVIEW, slug: "other" });
    vi.mocked(service.getRules).mockRejectedValue(new Error("down"));

    expect(await useRulesStore.getState().fetchRules("acme")).toBeNull();
    expect(useRulesStore.getState()).toMatchObject({ overview: null, loadFailed: true, error: "down" });
  });

  it("drafts a rule, or says why not", async () => {
    vi.mocked(service.draftRule).mockResolvedValueOnce(DRAFT);
    expect(await useRulesStore.getState().draftRule("acme", { text: "x", scope: "workspace" })).toEqual(DRAFT);

    vi.mocked(service.draftRule).mockRejectedValueOnce(new Error("The model didn't answer."));
    expect(await useRulesStore.getState().draftRule("acme", { text: "x", scope: "workspace" })).toBeNull();
    expect(useRulesStore.getState().error).toBe("The model didn't answer.");
  });

  it("adds a rule and reads the rules again; a refused rule changes nothing", async () => {
    vi.mocked(service.getRules).mockResolvedValue(OVERVIEW);
    vi.mocked(service.addRule).mockResolvedValueOnce({ saved: true, draft: DRAFT });
    expect(await useRulesStore.getState().addRule("acme", { text: "x", scope: "workspace", rules: [] }))
      .toEqual({ saved: true, draft: DRAFT });
    expect(service.getRules).toHaveBeenCalledTimes(1);

    vi.mocked(service.addRule).mockResolvedValueOnce({ saved: false, draft: { ...DRAFT, passed: false } });
    expect((await useRulesStore.getState().addRule("acme", { text: "x", scope: "workspace", rules: [] }))?.saved).toBe(false);
    expect(service.getRules).toHaveBeenCalledTimes(1);

    vi.mocked(service.addRule).mockRejectedValueOnce(new Error("Only an owner or admin"));
    expect(await useRulesStore.getState().addRule("acme", { text: "x", scope: "workspace", rules: [] })).toBeNull();
    expect(useRulesStore.getState().error).toBe("Only an owner or admin");
  });

  it("removes a rule and reads the rules again", async () => {
    vi.mocked(service.getRules).mockResolvedValue(OVERVIEW);
    vi.mocked(service.removeRule).mockResolvedValueOnce(undefined);
    expect(await useRulesStore.getState().removeRule("acme", "workspace", null, "ws-x")).toBe(true);
    expect(service.removeRule).toHaveBeenCalledWith("acme", "workspace", null, "ws-x");

    vi.mocked(service.removeRule).mockRejectedValueOnce(new Error("It would change other rules"));
    expect(await useRulesStore.getState().removeRule("acme", "workspace", null, "ws-x")).toBe(false);
    expect(useRulesStore.getState().error).toBe("It would change other rules");
  });

  it("checks what would happen to an action", async () => {
    const check = { facts: { action: "file.write" }, decision: null, unclear: null };
    vi.mocked(service.checkAction).mockResolvedValueOnce(check);
    expect(await useRulesStore.getState().checkAction("acme", "x", null)).toEqual(check);

    vi.mocked(service.checkAction).mockRejectedValueOnce(new Error("down"));
    expect(await useRulesStore.getState().checkAction("acme", "x", 12)).toBeNull();
    expect(useRulesStore.getState().error).toBe("down");
  });
});
