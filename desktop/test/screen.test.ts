import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  centeredIn,
  firstScreen,
  isScreenAction,
  parseScreenRect,
  PLACE_ARG,
  placeFromArgs,
  relaunchArgs,
  SCREENS,
  screenHash,
  withNote,
  type ScreenState,
} from "../src/screen";

const page = (name: string) => readFileSync(join(__dirname, "..", "static", name), "utf8");

describe("one shell for every screen outside the main window", () => {
  for (const name of ["signin.html", "splash.html"]) {
    it(`${name} takes the shared stylesheet and the shared left panel, with no style of its own`, () => {
      const html = page(name);
      assert.match(html, /<link rel="stylesheet" href="shell\.css">/);
      assert.match(html, /<body>\s*<script src="panel\.js"><\/script>/);
      assert.doesNotMatch(html, /<style|style="/);
      assert.doesNotMatch(html, /class="paint"|painting\.webp/);
    });
  }

  it("builds the left panel in one place only", () => {
    assert.match(page("panel.js"), /<aside class="paint"/);
  });
});

describe("what a screen says, passed to the page through its address", () => {
  const read = (state: ScreenState) => new URLSearchParams(screenHash(state));

  it("gives the step and the line under it", () => {
    const params = read(SCREENS.installing("1.11.0"));
    assert.equal(params.get("step"), "Installing TaskForce 1.11.0");
    assert.equal(params.get("note"), "It takes a minute or two.\nTaskForce opens again by itself.");
    assert.equal(params.get("actions"), null);
  });

  it("gives a failure its actions, the main one last, and the raw detail one click away", () => {
    const params = read(SCREENS.startFailed("Database did not start: exit code 1 & more"));
    assert.equal(params.get("actions"), "quit,logs,retry");
    assert.equal(params.get("detail"), "Database did not start: exit code 1 & more");
  });

  it("keeps the step while the start goes through its stages", () => {
    assert.deepEqual(withNote(SCREENS.updated, "Starting the database"), { step: "Opening TaskForce", note: "Starting the database" });
  });

  it("knows only the actions the page can show", () => {
    const labels = /const LABELS = \{([^}]+)\}/.exec(page("splash.html"))?.[1] ?? "";
    for (const action of ["quit", "logs", "retry", "signin"]) {
      assert.equal(isScreenAction(action), true);
      assert.match(labels, new RegExp(`\\b${action}:`));
    }
    assert.equal(isScreenAction("delete"), false);
    assert.equal(isScreenAction(1), false);
  });

  it("keeps every step on one line: the installer draws it at the same place, without wrapping", () => {
    const steps = [
      SCREENS.starting,
      SCREENS.installing("1.12.10"),
      SCREENS.updated,
      SCREENS.notUpdated("1.12.10"),
      SCREENS.signingOut,
      SCREENS.signedOut,
      SCREENS.startFailed(""),
    ].map((state) => state.step);
    for (const step of steps) assert.ok(step.length <= 32, `too long for one line: ${step}`);
  });
});

describe("the first screen of a start", () => {
  const cases: [string, Parameters<typeof firstScreen>[0], ScreenState][] = [
    ["a plain start", null, SCREENS.starting],
    ["right after an update: the installer's last words", { outcome: "installed", version: "1.11.0" }, SCREENS.updated],
    ["after an update that did not take", { outcome: "not-installed", version: "1.11.0" }, SCREENS.notUpdated("1.11.0")],
    ["a version changed some other way", { outcome: null, version: "1.11.0" }, SCREENS.starting],
  ];
  for (const [label, update, expected] of cases) {
    it(label, () => assert.deepEqual(firstScreen(update), expected));
  }
});

describe("where a screen opens", () => {
  it("centers the window in the work area of a display", () => {
    assert.deepEqual(centeredIn({ x: 0, y: 0, width: 1536, height: 912 }), { x: 268, y: 136 });
    assert.deepEqual(centeredIn({ x: 1920, y: 0, width: 1920, height: 1032 }), { x: 2380, y: 196 });
  });

  it("keeps its corner on a display smaller than the window", () => {
    assert.deepEqual(centeredIn({ x: -1280, y: 0, width: 960, height: 520 }), { x: -1280, y: 0 });
  });

  it("gives its place to the next instance when the app relaunches, once", () => {
    const args = relaunchArgs([".", `${PLACE_ARG}1,2`, "--inspect"], { x: -1500.4, y: 120.6 });
    assert.deepEqual(args, [".", "--inspect", `${PLACE_ARG}-1500,121`]);
    assert.deepEqual(placeFromArgs(args), { x: -1500, y: 121 });
    assert.deepEqual(relaunchArgs(args, null), [".", "--inspect"]);
  });

  it("finds no place in arguments that do not give one", () => {
    assert.equal(placeFromArgs(["."]), null);
    assert.equal(placeFromArgs([`${PLACE_ARG}left,top`]), null);
  });

  const rects: [string, string, ReturnType<typeof parseScreenRect>][] = [
    ["the installer's window, in pixels", "268 136 1250 800", { x: 268, y: 136, width: 1250, height: 800 }],
    ["on a display left of the main one", "-1730 96 1000 640\r\n", { x: -1730, y: 96, width: 1000, height: 640 }],
    ["an empty file, from an installer that did not say", "", null],
    ["a window without a size", "10 10 0 640", null],
    ["anything else", "TaskForce", null],
  ];
  for (const [label, text, expected] of rects) {
    it(`reads the installer's place: ${label}`, () => assert.deepEqual(parseScreenRect(text), expected));
  }
});
