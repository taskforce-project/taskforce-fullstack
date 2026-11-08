import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { Session } from "electron";

import { applyPermissions, permissionAllowed, type PermissionQuery } from "../src/permissions";

const APP = "http://127.0.0.1:61700";

const query = (overrides: Partial<PermissionQuery>): PermissionQuery => ({
  permission: "media",
  url: `${APP}/acme`,
  appOrigin: APP,
  voice: true,
  isMainFrame: true,
  mediaTypes: ["audio"],
  ...overrides,
});

describe("permissionAllowed", () => {
  const cases: [string, Partial<PermissionQuery>, boolean][] = [
    ["the microphone for the window", {}, true],
    ["a check without a precise medium", { mediaTypes: [] }, true],
    ["a check for an unknown medium", { mediaTypes: ["unknown"] }, true],
    ["the camera", { mediaTypes: ["video"] }, false],
    ["the microphone and the camera", { mediaTypes: ["audio", "video"] }, false],
    ["the microphone for another page", { url: "https://elsewhere.test/page" }, false],
    ["the microphone for another port", { url: "http://127.0.0.1:61701/acme" }, false],
    ["the microphone for an iframe", { isMainFrame: false }, false],
    ["the microphone where voice is absent", { voice: false }, false],
    ["the microphone before the app is up", { appOrigin: null }, false],
    ["the sign-in page, a local file", { url: "file:///app/static/signin.html" }, false],
    ["an address that does not parse", { url: "not a url" }, false],
    ["no address", { url: undefined }, false],
    ["writing to the clipboard", { permission: "clipboard-sanitized-write" }, true],
    ["writing to the clipboard from elsewhere", { permission: "clipboard-sanitized-write", url: "https://elsewhere.test" }, false],
    ["full screen", { permission: "fullscreen" }, true],
    ["the location", { permission: "geolocation" }, false],
    ["system notifications", { permission: "notifications" }, false],
    ["reading the clipboard", { permission: "clipboard-read" }, false],
    ["capturing the screen", { permission: "display-capture" }, false],
    ["MIDI devices", { permission: "midi" }, false],
  ];

  for (const [name, overrides, expected] of cases) {
    it(`${expected ? "allows" : "refuses"} ${name}`, () => {
      assert.equal(permissionAllowed(query(overrides)), expected);
    });
  }
});

describe("applyPermissions", () => {
  type RequestHandler = (wc: unknown, permission: string, callback: (allowed: boolean) => void, details: Record<string, unknown>) => void;
  type CheckHandler = (wc: unknown, permission: string, origin: string, details: Record<string, unknown>) => boolean;

  function install(appOrigin: string | null = APP, voice = true) {
    let request: RequestHandler = () => undefined;
    let check: CheckHandler = () => false;
    const session = {
      setPermissionRequestHandler: (handler: RequestHandler) => (request = handler),
      setPermissionCheckHandler: (handler: CheckHandler) => (check = handler),
    } as unknown as Session;
    applyPermissions(session, () => appOrigin, voice);
    return { request: (...args: Parameters<RequestHandler>) => request(...args), check: (...args: Parameters<CheckHandler>) => check(...args) };
  }

  it("answers a request with what it decides", () => {
    const { request } = install();
    const answers: boolean[] = [];

    request(null, "media", (allowed) => answers.push(allowed), { requestingUrl: `${APP}/`, isMainFrame: true, mediaTypes: ["audio"] });
    request(null, "media", (allowed) => answers.push(allowed), { requestingUrl: `${APP}/`, isMainFrame: true, mediaTypes: ["video"] });
    request(null, "geolocation", (allowed) => answers.push(allowed), { requestingUrl: `${APP}/`, isMainFrame: true });

    assert.deepEqual(answers, [true, false, false]);
  });

  it("answers a check from the origin when the page address is absent", () => {
    const { check } = install();

    assert.equal(check(null, "media", `${APP}/`, { mediaType: "audio", isMainFrame: true }), true);
    assert.equal(check(null, "media", `${APP}/`, { mediaType: "video", isMainFrame: true }), false);
    assert.equal(check(null, "media", "https://elsewhere.test/", { mediaType: "audio", isMainFrame: true }), false);
    assert.equal(check(null, "clipboard-sanitized-write", `${APP}/`, {}), true);
  });
});
