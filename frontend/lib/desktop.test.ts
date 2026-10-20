import { afterEach, describe, expect, it, vi } from "vitest";

/** `IS_DESKTOP` est figé au chargement (comme au build) : chaque cas recharge le module avec son environnement. */
async function loadDesktop(flag?: string) {
  if (flag !== undefined) vi.stubEnv("NEXT_PUBLIC_DESKTOP", flag);
  vi.resetModules();
  return import("./desktop");
}

const bridge = {
  launchToken: "tfd_launch",
  version: "1.0.0",
  platform: "win32",
  email: "ada@example.com",
  signOut: vi.fn(),
  openAccountPage: vi.fn(),
  checkForUpdates: vi.fn(),
};

describe("desktop bridge", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop;
  });

  it("is off in the web build, even when a page defines the bridge", async () => {
    (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop = bridge;
    const desktop = await loadDesktop();

    expect(desktop.IS_DESKTOP).toBe(false);
    expect(desktop.desktopBridge()).toBeNull();
  });

  it("asks the shell for a system notification in the desktop build, and nothing on the web app", async () => {
    const notify = vi.fn();
    (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop = { ...bridge, notify };

    (await loadDesktop("true")).notifySystem({ title: "Assigned to you", body: "APO-12", path: "/acme/projects/5" });
    (await loadDesktop("true")).notifySystem({ title: "Run finished", body: null, path: null });
    (await loadDesktop("false")).notifySystem({ title: "Hidden" });

    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenNthCalledWith(1, { title: "Assigned to you", body: "APO-12", path: "/acme/projects/5" });
    expect(notify).toHaveBeenNthCalledWith(2, { title: "Run finished" });
  });

  it("returns what the shell exposes in the desktop build", async () => {
    (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop = bridge;
    const desktop = await loadDesktop("true");

    expect(desktop.IS_DESKTOP).toBe(true);
    expect(desktop.desktopBridge()).toBe(bridge);
  });

  it("returns null in the desktop build opened outside the shell", async () => {
    const desktop = await loadDesktop("true");

    expect(desktop.desktopBridge()).toBeNull();
  });

  it("tells when the account was already set up on the web app, only in the desktop app", async () => {
    (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop = { ...bridge, onboardedOnline: true };
    expect((await loadDesktop()).onboardedOnline()).toBe(false);
    expect((await loadDesktop("true")).onboardedOnline()).toBe(true);

    (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop = bridge;
    expect((await loadDesktop("true")).onboardedOnline()).toBe(false);
  });
});
