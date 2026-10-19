import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Le mode desktop est figé au chargement (comme au build) : chaque cas recharge le module avec son environnement. */
async function loadSessionToken(desktop: boolean) {
  if (desktop) vi.stubEnv("NEXT_PUBLIC_DESKTOP", "true");
  vi.resetModules();
  return (await import("./session-token")).getSessionToken;
}

describe("getSessionToken", () => {
  beforeEach(() => {
    vi.mocked(localStorage.getItem).mockImplementation((key: string) => (key === "accessToken" ? "web-token" : null));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop;
  });

  it("reads the token the sign-in stored in the browser", async () => {
    const getSessionToken = await loadSessionToken(false);

    expect(getSessionToken()).toBe("web-token");
  });

  it("uses the launch token of the desktop shell, never the browser storage", async () => {
    (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop = { launchToken: "tfd_launch" };
    const getSessionToken = await loadSessionToken(true);

    expect(getSessionToken()).toBe("tfd_launch");
  });

  it("has no token in the desktop build opened outside the shell", async () => {
    const getSessionToken = await loadSessionToken(true);

    expect(getSessionToken()).toBeNull();
  });
});
