import { beforeEach, describe, expect, it, vi } from "vitest";

import * as service from "../api/cortex-sources-service";
import { useCortexSourcesStore } from "./cortex-sources-store";

vi.mock("../api/cortex-sources-service", () => ({ getCortexSources: vi.fn() }));

const SOURCES = [
  { key: "projects" as const, count: 4, changedAt: "2026-11-07T18:02:00" },
  { key: "notes" as const, count: 0, changedAt: null },
];

/** Ce que Cortex lit dans l'espace (R125) : une lecture, qui garde ce qu'elle avait sur une panne. */
describe("useCortexSourcesStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCortexSourcesStore.setState({ sources: null, slug: null, failed: false });
  });

  it("reads the sources of the workspace", async () => {
    vi.mocked(service.getCortexSources).mockResolvedValue({ sources: SOURCES });

    expect(await useCortexSourcesStore.getState().fetchSources("acme")).toEqual(SOURCES);
    expect(useCortexSourcesStore.getState()).toMatchObject({ sources: SOURCES, slug: "acme", failed: false });
  });

  it("keeps what it read when a new read fails, and says the read failed", async () => {
    useCortexSourcesStore.setState({ sources: SOURCES, slug: "acme" });
    vi.mocked(service.getCortexSources).mockRejectedValue(new Error("down"));

    expect(await useCortexSourcesStore.getState().fetchSources("acme")).toBeNull();
    expect(useCortexSourcesStore.getState()).toMatchObject({ sources: SOURCES, failed: true });
  });

  it("forgets a failure that belongs to the workspace it left", async () => {
    vi.mocked(service.getCortexSources).mockRejectedValue(new Error("down"));

    const late = useCortexSourcesStore.getState().fetchSources("beta");
    useCortexSourcesStore.setState({ slug: "gamma" });
    await late;

    expect(useCortexSourcesStore.getState().failed).toBe(false);
  });

  it("starts from nothing in another workspace, and ignores a late answer for the one it left", async () => {
    useCortexSourcesStore.setState({ sources: SOURCES, slug: "acme" });
    let answer: (value: { sources: typeof SOURCES }) => void = () => {};
    vi.mocked(service.getCortexSources).mockImplementationOnce(
      () => new Promise((resolve) => { answer = resolve; }),
    );

    const late = useCortexSourcesStore.getState().fetchSources("beta");
    expect(useCortexSourcesStore.getState()).toMatchObject({ sources: null, slug: "beta" });
    useCortexSourcesStore.setState({ slug: "gamma" });
    answer({ sources: SOURCES });
    await late;

    expect(useCortexSourcesStore.getState().sources).toBeNull();
  });
});
