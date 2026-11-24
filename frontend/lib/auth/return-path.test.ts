import { afterEach, describe, expect, it } from "vitest";

import { afterSignInPath, saveDesktopRequest } from "./desktop-handoff";
import { clearReturnPath, rememberReturnPath, returnable, returnPath } from "./return-path";

/**
 * La connexion garde la page demandée (R161 M4 de #552) : la page de vérification d'un dossier, ou le lien du témoin qui
 * l'ouvre. Rien d'autre : une adresse venue d'ailleurs ne détourne pas la connexion.
 */
const LINK = "/verify/0123456789abcdef0123456789abcdef";

describe("return-path", () => {
  afterEach(() => sessionStorage.clear());

  it("ne garde que les pages de vérification", () => {
    expect(returnable(LINK)).toBe(true);
    expect(returnable("/acme/missions/42/verification")).toBe(true);
    expect(returnable("/acme/missions/42")).toBe(false);
    expect(returnable("//evil.example/verify/0123456789abcdef0123456789abcdef")).toBe(false);
    expect(returnable("/verify/not-an-id")).toBe(false);
    rememberReturnPath("/acme/settings");
    expect(returnPath()).toBeNull();
  });

  it("la connexion revient sur la page demandée, jusqu'à l'arrivée, et pas au-delà d'une demi-heure", () => {
    const now = Date.now();
    rememberReturnPath(LINK, now);
    expect(returnPath(now + 1_000)).toBe(LINK);
    expect(afterSignInPath("/")).toBe(LINK);
    // L'onboarding d'un nouveau venu passe d'abord.
    expect(afterSignInPath("/onboarding")).toBe("/onboarding");
    clearReturnPath();
    expect(afterSignInPath("/")).toBe("/");
    rememberReturnPath(LINK, now);
    expect(returnPath(now + 30 * 60_000)).toBeNull();
    expect(sessionStorage.getItem("tf.returnTo")).toBeNull();
  });

  it("une demande de l'app desktop passe avant", () => {
    rememberReturnPath(LINK);
    saveDesktopRequest({ codeChallenge: "a".repeat(43), redirectUri: "http://127.0.0.1:47812/callback", state: "state-1234", signUp: false, savedAt: Date.now() });
    expect(afterSignInPath("/")).toBe("/auth/desktop");
  });

  it("une entrée abîmée s'efface", () => {
    sessionStorage.setItem("tf.returnTo", "{not json");
    expect(returnPath()).toBeNull();
    sessionStorage.setItem("tf.returnTo", JSON.stringify({ path: "/acme/settings", savedAt: Date.now() }));
    expect(returnPath()).toBeNull();
    expect(sessionStorage.getItem("tf.returnTo")).toBeNull();
  });
});
