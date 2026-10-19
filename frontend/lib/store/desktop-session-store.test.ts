import { beforeEach, describe, expect, it, vi } from "vitest";

import * as service from "../api/desktop-session-service";
import { useDesktopSessionStore } from "./desktop-session-store";

vi.mock("../api/desktop-session-service", () => ({
  authorizeDesktopApp: vi.fn(),
  listDesktopSessions: vi.fn(),
  revokeDesktopSession: vi.fn(),
}));

const SESSION = { id: 1, name: "Windows", createdAt: null, lastUsedAt: null, expiresAt: null };
const REQUEST = { codeChallenge: "c".repeat(43), redirectUri: "http://127.0.0.1:47812/callback", state: "state-1234", signUp: true, savedAt: 1 };

describe("useDesktopSessionStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDesktopSessionStore.setState({ sessions: null, error: null });
  });

  it("authorizes the app with what it asked for, nothing more", async () => {
    vi.mocked(service.authorizeDesktopApp).mockResolvedValue("http://127.0.0.1:47812/callback?code=x&state=state-1234");

    expect(await useDesktopSessionStore.getState().authorize(REQUEST)).toBe("http://127.0.0.1:47812/callback?code=x&state=state-1234");
    expect(service.authorizeDesktopApp).toHaveBeenCalledWith({
      codeChallenge: REQUEST.codeChallenge, redirectUri: REQUEST.redirectUri, state: REQUEST.state,
    });
  });

  it("says why the app couldn't be authorized", async () => {
    vi.mocked(service.authorizeDesktopApp).mockRejectedValue(new Error("Invalid sign-in request"));

    expect(await useDesktopSessionStore.getState().authorize(REQUEST)).toBeNull();
    expect(useDesktopSessionStore.getState().error).toBe("Invalid sign-in request");
  });

  it("lists the signed-in computers", async () => {
    vi.mocked(service.listDesktopSessions).mockResolvedValue([SESSION]);

    expect(await useDesktopSessionStore.getState().fetchSessions()).toEqual([SESSION]);
    expect(useDesktopSessionStore.getState().sessions).toEqual([SESSION]);
  });

  it("keeps the list when it can't be read", async () => {
    vi.mocked(service.listDesktopSessions).mockRejectedValue(new Error("down"));

    expect(await useDesktopSessionStore.getState().fetchSessions()).toBeNull();
    expect(useDesktopSessionStore.getState().sessions).toBeNull();
  });

  it("signs a computer out and drops it from the list", async () => {
    useDesktopSessionStore.setState({ sessions: [SESSION, { ...SESSION, id: 2, name: "Linux" }] });
    vi.mocked(service.revokeDesktopSession).mockResolvedValue();

    expect(await useDesktopSessionStore.getState().revokeSession(1)).toBe(true);
    expect(useDesktopSessionStore.getState().sessions?.map((s) => s.id)).toEqual([2]);
  });

  it("signs a computer out before the list is read", async () => {
    vi.mocked(service.revokeDesktopSession).mockResolvedValue();

    expect(await useDesktopSessionStore.getState().revokeSession(1)).toBe(true);
    expect(useDesktopSessionStore.getState().sessions).toEqual([]);
  });

  it("says why a computer couldn't be signed out", async () => {
    vi.mocked(service.revokeDesktopSession).mockRejectedValue(new Error("Session not found"));

    expect(await useDesktopSessionStore.getState().revokeSession(9)).toBe(false);
    expect(useDesktopSessionStore.getState().error).toBe("Session not found");
  });
});
