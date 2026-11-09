import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { launchInstaller, waitUntil } from "../src/installer-launch";

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tf-installer-launch-"));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("launching the downloaded installer, off the main thread", () => {
  it("starts it detached, with its arguments, and resolves once it has started", async () => {
    const proof = join(dir, "started");

    await launchInstaller(process.execPath, ["-e", `require("node:fs").writeFileSync(${JSON.stringify(proof)}, "yes")`]);

    assert.equal(await waitUntil(() => existsSync(proof), 10_000, 20), true);
  });

  it("rejects when the installer cannot start", async () => {
    await assert.rejects(launchInstaller(join(dir, "not-an-installer.exe"), []), /ENOENT/);
  });
});

describe("waiting for a condition", () => {
  it("says true as soon as the condition holds", async () => {
    let calls = 0;
    assert.equal(await waitUntil(() => ++calls === 3, 1_000, 1), true);
    assert.equal(calls, 3);
  });

  it("says false when the time is up, without waiting for ever", async () => {
    assert.equal(await waitUntil(() => false, 30, 5), false);
  });
});
