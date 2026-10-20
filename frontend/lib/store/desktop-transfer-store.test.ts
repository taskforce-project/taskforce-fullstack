import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopWebWorkspace } from "../desktop";

/** `IS_DESKTOP` est figé au chargement (comme au build) : chaque cas recharge le store avec son environnement. */
async function loadStore(flag = "true") {
  vi.stubEnv("NEXT_PUBLIC_DESKTOP", flag);
  vi.resetModules();
  return (await import("./desktop-transfer-store")).useDesktopTransferStore;
}

const WEB: DesktopWebWorkspace[] = [
  { slug: "acme", name: "Acme", projects: [{ id: 5, name: "Apollo", identifier: "APO", issueCount: 12 }] },
];

/** Pont de la coque, tel que `desktop/src/preload.ts` l'expose : seuls les projets servent ici. */
function installBridge() {
  const bridge = { projects: { web: vi.fn(), bring: vi.fn(), send: vi.fn(), openWeb: vi.fn() } };
  (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop = bridge;
  return bridge;
}

const MOVE = { workspace: "acme", projectId: 5, target: "ada" };

describe("useDesktopTransferStore", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop;
  });

  it("does nothing outside the desktop app, and says why", async () => {
    const bridge = installBridge();
    const store = await loadStore("false");

    expect(await store.getState().fetchWebProjects()).toBeNull();
    expect(await store.getState().bring(MOVE)).toBeNull();
    store.getState().openWeb("https://app.example.test/acme");
    expect(store.getState().error).toMatch(/desktop app/);
    expect(bridge.projects.web).not.toHaveBeenCalled();
    expect(bridge.projects.openWeb).not.toHaveBeenCalled();
  });

  it("reads the web projects", async () => {
    const bridge = installBridge();
    bridge.projects.web.mockResolvedValue({ ok: true, value: WEB });
    const store = await loadStore();

    expect(await store.getState().fetchWebProjects()).toEqual(WEB);
    expect(store.getState()).toMatchObject({ webWorkspaces: WEB, loading: false, error: null });
  });

  it.each([
    ["the shell refuses", { ok: false, error: "The session ended: sign in again" }, "The session ended: sign in again"],
  ])("keeps the message when %s", async (_name, answer, message) => {
    const bridge = installBridge();
    bridge.projects.web.mockResolvedValue(answer);
    const store = await loadStore();

    expect(await store.getState().fetchWebProjects()).toBeNull();
    expect(store.getState().error).toBe(message);
  });

  it("keeps a message when the shell throws", async () => {
    const bridge = installBridge();
    bridge.projects.web.mockRejectedValue(new Error("ipc down"));
    bridge.projects.send.mockRejectedValue(new Error("ipc down"));
    const store = await loadStore();

    expect(await store.getState().fetchWebProjects()).toBeNull();
    expect(await store.getState().send(MOVE)).toBeNull();
    expect(store.getState()).toMatchObject({ moving: null, error: "ipc down" });
  });

  it.each(["bring", "send"] as const)("%s: copies the project once, and remembers it", async (kind) => {
    const bridge = installBridge();
    const moved = { id: 9, name: "Apollo", workspace: "ada" };
    let finish: (value: unknown) => void = () => {};
    bridge.projects[kind].mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const store = await loadStore();

    const first = store.getState()[kind](MOVE);
    expect(store.getState().moving).toBe("acme/5");
    expect(await store.getState()[kind](MOVE)).toBeNull(); // une copie à la fois
    finish({ ok: true, value: moved });

    expect(await first).toEqual(moved);
    expect(bridge.projects[kind]).toHaveBeenCalledTimes(1);
    expect(bridge.projects[kind]).toHaveBeenCalledWith(MOVE);
    expect(store.getState()).toMatchObject({ moving: null, moved: { "acme/5": moved } });
  });

  it("keeps the shell's message when a copy fails", async () => {
    const bridge = installBridge();
    bridge.projects.bring.mockResolvedValue({ ok: false, error: "This file isn't a TaskForce project file." });
    const store = await loadStore();

    expect(await store.getState().bring(MOVE)).toBeNull();
    expect(store.getState()).toMatchObject({ moving: null, error: "This file isn't a TaskForce project file." });
  });

  it("opens an address of the web app through the shell", async () => {
    const bridge = installBridge();
    const store = await loadStore();

    store.getState().openWeb("https://app.example.test/acme/projects/42");

    expect(bridge.projects.openWeb).toHaveBeenCalledWith("https://app.example.test/acme/projects/42");
  });
});
