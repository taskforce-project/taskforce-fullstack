import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { integratedTitleBar, MAIN_TITLE_BAR_HEIGHT, titleBarHeight, titleBarOptions, titleBarOverlay } from "../src/window-chrome";

describe("window chrome", () => {
  it("draws its own title bar on Windows and Linux, keeps the macOS frame", () => {
    assert.equal(integratedTitleBar("win32"), true);
    assert.equal(integratedTitleBar("linux"), true);
    assert.equal(integratedTitleBar("darwin"), false);
    assert.deepEqual(titleBarOptions("darwin", false, MAIN_TITLE_BAR_HEIGHT), {});
  });

  it("hides the system title bar and lays the system buttons over the interface", () => {
    assert.deepEqual(titleBarOptions("win32", false, MAIN_TITLE_BAR_HEIGHT), {
      titleBarStyle: "hidden",
      titleBarOverlay: { color: "#00000000", symbolColor: "#191715", height: 64 },
    });
  });

  it("takes the height the page asks for, within bounds", () => {
    assert.equal(titleBarHeight(56), 56);
    assert.equal(titleBarHeight(55.6), 56);
    for (const wrong of [undefined, "56", 10, 400, Number.NaN]) assert.equal(titleBarHeight(wrong), MAIN_TITLE_BAR_HEIGHT);
  });

  it("follows the interface theme", () => {
    assert.equal(titleBarOverlay(true, 44).symbolColor, "#f3f2f0");
    assert.equal(titleBarOverlay(false, 44).symbolColor, "#191715");
    assert.equal(titleBarOverlay(true, 44).height, 44);
  });
});
