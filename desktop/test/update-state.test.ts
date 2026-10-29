import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { IDLE, reduceUpdate, type UpdateEvent, type UpdateState } from "../src/update-state";

const downloading = (percent: number): UpdateState => ({ status: "downloading", version: "1.3.3", percent });
const ready: UpdateState = { status: "ready", version: "1.3.3" };

describe("update state, as the interface shows it", () => {
  const cases: [string, UpdateState, UpdateEvent, UpdateState | null][] = [
    ["a new version starts downloading", IDLE, { kind: "available", version: "1.3.3" }, downloading(0)],
    ["the progress moves by whole percents", downloading(3), { kind: "progress", percent: 41.7 }, downloading(41)],
    ["the same percent shows nothing new", downloading(41), { kind: "progress", percent: 41.2 }, null],
    ["100 % waits for the download to be checked", downloading(98), { kind: "progress", percent: 100 }, downloading(99)],
    ["a progress without a download is ignored", IDLE, { kind: "progress", percent: 50 }, null],
    ["a second check while downloading changes nothing", downloading(20), { kind: "available", version: "1.3.3" }, null],
    ["the download ends: ready to restart", downloading(99), { kind: "downloaded", version: "1.3.3" }, ready],
    ["a check after the download keeps it ready", ready, { kind: "available", version: "1.3.3" }, null],
    ["a newer version replaces a ready one", ready, { kind: "available", version: "1.3.4" },
      { status: "downloading", version: "1.3.4", percent: 0 }],
    ["a failed download says so", downloading(60), { kind: "error", message: "net::ERR_CONNECTION_RESET" },
      { status: "failed", version: "1.3.3", message: "net::ERR_CONNECTION_RESET" }],
    ["a failed check while offline shows nothing", IDLE, { kind: "error", message: "net::ERR_INTERNET_DISCONNECTED" }, null],
  ];
  for (const [label, state, event, expected] of cases) {
    it(label, () => assert.deepEqual(reduceUpdate(state, event), expected));
  }
});
