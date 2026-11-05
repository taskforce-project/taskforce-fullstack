import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { PENDING_FILE, pendingOutcome, savePending, takePending, type PendingUpdate } from "../src/update-pending";

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tf-update-pending-"));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("the update noted before quitting, read once at the next start", () => {
  it("reads back the update it noted, then forgets it", () => {
    savePending(dir, { version: "1.7.1", from: "1.7.0" });

    assert.deepEqual(takePending(dir), { version: "1.7.1", from: "1.7.0" });
    assert.equal(existsSync(join(dir, PENDING_FILE)), false);
    assert.equal(takePending(dir), null);
  });

  const unreadable: [string, string][] = [
    ["a broken file", "{\"version\": \"1.7"],
    ["a file without the versions", "{\"version\": 171}"],
    ["a file that is not an object", "null"],
  ];
  for (const [label, content] of unreadable) {
    it(`ignores ${label}, and removes it`, () => {
      writeFileSync(join(dir, PENDING_FILE), content);

      assert.equal(takePending(dir), null);
      assert.equal(existsSync(join(dir, PENDING_FILE)), false);
    });
  }

  it("has nothing to say without a note", () => assert.equal(takePending(dir), null));
});

describe("what the next start makes of it", () => {
  const pending: PendingUpdate = { version: "1.7.1", from: "1.7.0" };
  const cases: [string, PendingUpdate | null, string, ReturnType<typeof pendingOutcome>][] = [
    ["the new version runs: installed", pending, "1.7.1", "installed"],
    ["the app is still on the version before: not installed", pending, "1.7.0", "not-installed"],
    ["the app changed some other way (installed by hand): nothing to say", pending, "1.8.0", null],
    ["no update was noted: nothing to say", null, "1.7.0", null],
  ];
  for (const [label, noted, running, expected] of cases) {
    it(label, () => assert.equal(pendingOutcome(noted, running), expected));
  }
});
