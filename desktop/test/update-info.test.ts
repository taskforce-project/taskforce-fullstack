import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error script .mjs sans déclaration de types
import { updateInfo } from "../scripts/update-info.mjs";

const LATEST = `version: 1.0.1
files:
  - url: TaskForce-Setup-1.0.1.exe
    sha512: OLDSHA==
    size: 271090000
path: TaskForce-Setup-1.0.1.exe
sha512: OLDSHA==
releaseDate: '2026-10-20T01:00:00.000Z'
`;

describe("update info after signing", () => {
  it("puts the signed installer's sha512 and size in latest.yml", () => {
    const next = updateInfo(LATEST, "TaskForce-Setup-1.0.1.exe", { sha512: "NEWSHA==", size: 271100000 });

    assert.equal(next.match(/sha512: NEWSHA==/g)?.length, 2);
    assert.match(next, /^ {4}size: 271100000$/m);
    assert.doesNotMatch(next, /OLDSHA/);
    assert.match(next, /^version: 1\.0\.1$/m);
    assert.match(next, /^releaseDate: '2026-10-20T01:00:00\.000Z'$/m);
  });

  it("refuses a latest.yml that does not list the installer", () => {
    assert.throws(() => updateInfo(LATEST, "TaskForce-Setup-9.9.9.exe", { sha512: "X", size: 1 }), /not in latest\.yml/);
  });
});
