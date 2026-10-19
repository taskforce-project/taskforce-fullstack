import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopToolsStatus } from "../desktop";

/** `IS_DESKTOP` est figé au chargement (comme au build) : chaque cas recharge le store avec son environnement. */
async function loadStore(flag: string | undefined = "true") {
  if (flag !== undefined) vi.stubEnv("NEXT_PUBLIC_DESKTOP", flag);
  vi.resetModules();
  return (await import("./desktop-tools-store")).useDesktopToolsStore;
}

const READY: DesktopToolsStatus = {
  claude: { installed: true, version: "2.1.293", signedIn: true },
  git: { installed: true, version: "2.54.0" },
  github: { installed: true, signedIn: true, login: "ada" },
};

/** Pont de la coque, tel que `desktop/src/preload.ts` l'expose : seuls les outils et GitHub servent ici. */
function installBridge() {
  const bridge = {
    tools: { status: vi.fn() },
    github: {
      repos: vi.fn(),
      repo: vi.fn(),
      createRepo: vi.fn(),
      signIn: vi.fn(),
      openSignInPage: vi.fn(),
      waitForSignIn: vi.fn(),
      cancelSignIn: vi.fn(),
    },
  };
  (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop = bridge;
  return bridge;
}

describe("useDesktopToolsStore", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop;
  });

  describe("outside the desktop app", () => {
    it("does nothing and says why when asked for a repository", async () => {
      const bridge = installBridge();
      const store = await loadStore("false");

      expect(await store.getState().refresh()).toBeNull();
      expect(await store.getState().fetchRepos()).toBeNull();
      expect(await store.getState().startGitHubSignIn()).toBe(false);
      expect(await store.getState().resolveRepo("link", "acme/site", true)).toBeNull();
      expect(store.getState().error).toBe("Only available in the TaskForce desktop app");
      expect(bridge.tools.status).not.toHaveBeenCalled();
    });
  });

  describe("refresh", () => {
    it("reads what is ready on this computer", async () => {
      const bridge = installBridge();
      bridge.tools.status.mockResolvedValue(READY);
      const store = await loadStore();

      expect(await store.getState().refresh()).toEqual(READY);
      expect(store.getState()).toMatchObject({ status: READY, checking: false });
    });

    it("keeps the previous state when the shell doesn't answer", async () => {
      const bridge = installBridge();
      bridge.tools.status.mockRejectedValue(new Error("gone"));
      const store = await loadStore();

      expect(await store.getState().refresh()).toBeNull();
      expect(store.getState()).toMatchObject({ status: null, checking: false });
    });
  });

  describe("fetchRepos", () => {
    it("loads the repositories GitHub CLI sees", async () => {
      const bridge = installBridge();
      const repos = [{ fullName: "acme/site", private: true, canPush: true }];
      bridge.github.repos.mockResolvedValue({ ok: true, value: repos });
      const store = await loadStore();

      expect(await store.getState().fetchRepos()).toEqual(repos);
      expect(store.getState().repos).toEqual(repos);
    });

    it.each([
      ["GitHub refuses", () => Promise.resolve({ ok: false, error: "Bad credentials" }), "Bad credentials"],
      ["the shell doesn't answer", () => Promise.reject(new Error("gone")), null],
    ])("returns null when %s", async (_case, answer, error) => {
      const bridge = installBridge();
      bridge.github.repos.mockImplementation(answer);
      const store = await loadStore();

      expect(await store.getState().fetchRepos()).toBeNull();
      expect(store.getState().repos).toBeNull();
      expect(store.getState().error).toBe(error);
    });
  });

  describe("resolveRepo", () => {
    it("creates the repository with GitHub CLI, then lets the list be read again", async () => {
      const bridge = installBridge();
      bridge.github.createRepo.mockResolvedValue({ ok: true, value: "ada/site" });
      const store = await loadStore();
      store.setState({ repos: [] });

      expect(await store.getState().resolveRepo("create", "site", true)).toBe("ada/site");
      expect(bridge.github.createRepo).toHaveBeenCalledWith({ name: "site", private: true });
      expect(store.getState().repos).toBeNull();
    });

    it("says why GitHub refused to create it", async () => {
      const bridge = installBridge();
      bridge.github.createRepo.mockResolvedValue({ ok: false, error: "Name already exists on this account" });
      const store = await loadStore();

      expect(await store.getState().resolveRepo("create", "site", false)).toBeNull();
      expect(store.getState().error).toBe("Name already exists on this account");
    });

    it("links an existing repository the person can push to", async () => {
      const bridge = installBridge();
      bridge.github.repo.mockResolvedValue({ ok: true, value: { fullName: "Acme/Site", private: false, canPush: true } });
      const store = await loadStore();

      expect(await store.getState().resolveRepo("link", "acme/site", true)).toBe("Acme/Site");
    });

    it.each([
      ["a repository that doesn't exist", { ok: true, value: null }, "acme/site doesn't exist, or your GitHub account can't see it"],
      [
        "a repository without push access",
        { ok: true, value: { fullName: "acme/site", private: false, canPush: false } },
        "Your GitHub account can't push to acme/site: Claude Code couldn't open pull requests there",
      ],
      ["an error from GitHub", { ok: false, error: "HTTP 502" }, "HTTP 502"],
    ])("refuses %s", async (_case, answer, error) => {
      const bridge = installBridge();
      bridge.github.repo.mockResolvedValue(answer);
      const store = await loadStore();

      expect(await store.getState().resolveRepo("link", "acme/site", true)).toBeNull();
      expect(store.getState().error).toBe(error);
    });

    it("says so when the shell doesn't answer", async () => {
      const bridge = installBridge();
      bridge.github.repo.mockRejectedValue(new Error("gone"));
      const store = await loadStore();

      expect(await store.getState().resolveRepo("link", "acme/site", true)).toBeNull();
      expect(store.getState().error).toBe("GitHub didn't answer. Please try again.");
    });
  });

  describe("GitHub sign-in", () => {
    it("shows the one-time code, then reads GitHub again once signed in", async () => {
      const bridge = installBridge();
      let finish: (outcome: { ok: true }) => void = () => {};
      bridge.github.signIn.mockResolvedValue({ ok: true, value: "1A2B-3C4D" });
      bridge.github.waitForSignIn.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      bridge.tools.status.mockResolvedValue(READY);
      bridge.github.repos.mockResolvedValue({ ok: true, value: [] });
      const store = await loadStore();

      expect(await store.getState().startGitHubSignIn()).toBe(true);
      expect(store.getState().signInCode).toBe("1A2B-3C4D");

      finish({ ok: true });
      await vi.waitFor(() => expect(store.getState().status).toEqual(READY));
      expect(store.getState()).toMatchObject({ signInCode: null, error: null, repos: [] });
    });

    it("says why the sign-in didn't finish", async () => {
      const bridge = installBridge();
      bridge.github.signIn.mockResolvedValue({ ok: true, value: "1A2B-3C4D" });
      bridge.github.waitForSignIn.mockResolvedValue({ ok: false, error: "The code expired" });
      const store = await loadStore();

      await store.getState().startGitHubSignIn();

      await vi.waitFor(() => expect(store.getState().error).toBe("The code expired"));
      expect(store.getState().signInCode).toBeNull();
      expect(bridge.tools.status).not.toHaveBeenCalled();
    });

    it("forgets a sign-in cancelled in the meantime", async () => {
      const bridge = installBridge();
      let finish: (outcome: { ok: false; error: string }) => void = () => {};
      bridge.github.signIn.mockResolvedValue({ ok: true, value: "1A2B-3C4D" });
      bridge.github.waitForSignIn.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      const store = await loadStore();

      await store.getState().startGitHubSignIn();
      store.getState().cancelGitHubSignIn();
      finish({ ok: false, error: "killed" });
      await Promise.resolve();

      expect(bridge.github.cancelSignIn).toHaveBeenCalled();
      expect(store.getState()).toMatchObject({ signInCode: null, error: null });
    });

    it.each([
      ["GitHub CLI can't start it", () => Promise.resolve({ ok: false, error: "GitHub CLI is not installed on this computer" }), "GitHub CLI is not installed on this computer"],
      ["the shell doesn't answer", () => Promise.reject(new Error("gone")), null],
    ])("doesn't start when %s", async (_case, answer, error) => {
      const bridge = installBridge();
      bridge.github.signIn.mockImplementation(answer);
      const store = await loadStore();

      expect(await store.getState().startGitHubSignIn()).toBe(false);
      expect(store.getState()).toMatchObject({ signInCode: null, error });
    });

    it("opens the GitHub page where the code is typed", async () => {
      const bridge = installBridge();
      const store = await loadStore();

      store.getState().openGitHubSignInPage();

      expect(bridge.github.openSignInPage).toHaveBeenCalled();
    });
  });
});
