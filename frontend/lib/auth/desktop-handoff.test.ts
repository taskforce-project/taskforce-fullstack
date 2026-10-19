import { afterEach, describe, expect, it, vi } from "vitest";

import {
  afterSignInPath,
  clearDesktopRequest,
  DESKTOP_SIGN_IN_PATH,
  pendingDesktopRequest,
  readDesktopRequest,
  saveDesktopRequest,
} from "./desktop-handoff";

const CHALLENGE = "c".repeat(43);
const REDIRECT = "http://127.0.0.1:47812/callback";

function params(values: Record<string, string>) {
  return new URLSearchParams(values);
}

describe("desktop-handoff", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  describe("readDesktopRequest", () => {
    it("reads what the app asked for", () => {
      expect(readDesktopRequest(params({ code_challenge: CHALLENGE, redirect_uri: REDIRECT, state: "state-1234" }), 5))
        .toEqual({ codeChallenge: CHALLENGE, redirectUri: REDIRECT, state: "state-1234", signUp: false, savedAt: 5 });
    });

    it("notes when the app asked to create an account", () => {
      const request = readDesktopRequest(params({ code_challenge: CHALLENGE, redirect_uri: REDIRECT, state: "state-1234", signup: "1" }));

      expect(request?.signUp).toBe(true);
    });

    it.each([
      ["a callback on another port", { code_challenge: CHALLENGE, redirect_uri: "http://127.0.0.1:8080/callback", state: "state-1234" }],
      ["a callback on another host", { code_challenge: CHALLENGE, redirect_uri: "http://evil.example/callback", state: "state-1234" }],
      ["a short challenge", { code_challenge: "abc", redirect_uri: REDIRECT, state: "state-1234" }],
      ["a strange state", { code_challenge: CHALLENGE, redirect_uri: REDIRECT, state: "a b" }],
      ["nothing", {}],
    ])("refuses %s", (_case, values) => {
      expect(readDesktopRequest(params(values as Record<string, string>))).toBeNull();
    });
  });

  describe("pending request", () => {
    const request = { codeChallenge: CHALLENGE, redirectUri: REDIRECT, state: "state-1234", signUp: false, savedAt: 1_000 };

    it("waits in the tab while the person signs in", () => {
      saveDesktopRequest(request);

      expect(pendingDesktopRequest(2_000)).toEqual(request);
    });

    it("sends the sign-in back to the app's agreement page", () => {
      saveDesktopRequest({ ...request, savedAt: Date.now() });

      expect(afterSignInPath("/onboarding")).toBe(DESKTOP_SIGN_IN_PATH);
    });

    it("forgets a request older than thirty minutes", () => {
      saveDesktopRequest(request);

      expect(pendingDesktopRequest(request.savedAt + 30 * 60_000)).toBeNull();
      expect(sessionStorage.getItem("tf.desktopSignIn")).toBeNull();
    });

    it("forgets a tampered request", () => {
      sessionStorage.setItem("tf.desktopSignIn", JSON.stringify({ ...request, redirectUri: "http://evil.example/callback" }));

      expect(pendingDesktopRequest(2_000)).toBeNull();
    });

    it("ignores unreadable storage", () => {
      sessionStorage.setItem("tf.desktopSignIn", "{not json");

      expect(pendingDesktopRequest(2_000)).toBeNull();
      expect(afterSignInPath("/")).toBe("/");
    });

    it("clears the request once used", () => {
      saveDesktopRequest(request);
      clearDesktopRequest();

      expect(pendingDesktopRequest(2_000)).toBeNull();
    });

    it("keeps going when the storage is unavailable", () => {
      const blocked = () => { throw new Error("blocked"); };
      vi.stubGlobal("sessionStorage", { setItem: blocked, getItem: blocked, removeItem: blocked });

      expect(() => saveDesktopRequest(request)).not.toThrow();
      expect(pendingDesktopRequest(2_000)).toBeNull();
      expect(() => clearDesktopRequest()).not.toThrow();
    });
  });
});
